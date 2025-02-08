import express from 'express'
import WebSocket from 'ws'
import msgpack from 'msgpack-lite'
import { List, Map, Set } from 'immutable'
import expressWs from 'express-ws';
import { PCA } from 'ml-pca';
import * as tf from '@tensorflow/tfjs'


import { AsyncInformant } from '../../../dicojs_mod/src/core/async_informant.js'
import { TaskID } from '../../../dicojs_mod/src/core/task/index.js'
import { AsyncBuffer } from '../../../dicojs_mod/src/core/async_buffer.js'
import { encodeCentroids, decodeCentroids } from '../../../dicojs_mod/src/msf/serialization/weights.js'
import { antibiogo } from '../../../dicojs_mod/src/msf/task.js'
import { aggregateCentroids} from '../../../dicojs_mod/src/msf/weights/aggregation.js'
import { Centroids } from '../../../dicojs_mod/src/msf/weights/centroids.js'

import { messageGeneral, pullServerStatistics } from '../../../dicojs_mod/src/core/client/federated/messages.js'
import { type } from '../../../dicojs_mod/src/core/client/messages.js'

import { readFromCsv, writeToCsv } from './centroids.js'
import messageTypes = type
import clientConnected = type.clientConnected
import { CONFIG } from '../config.js'

/*
Aggregation functions from server side. 
Defines API, functions called per server endpoint.
/trigger-aggregation: Triggers aggregation of centroids from model and client side.
/centroids: Shows centroids in buffer.
/discard: Discards all centroids in buffer.
*/

enum RequestType {
  Connect,
  Disconnect,

  PostAsyncWeights,

  GetMetadata,
  PostMetadata,

  GetAsyncRound,
}

interface Log {
  // a timestamp corresponding to the time at which the request was made
  timestamp: Date
  // the task ID for which the request was made
  task: TaskID
  // the round at which the request was made
  round: number
  // the client ID used to make the request
  client: string
  // the request type
  request: RequestType
}

interface TaskStatus {
  isRoundPending: boolean
  round: number
}

export class AntibiogoFederated {
  private readonly ownRouter: expressWs.Router

  private readonly UUIDRegexExp = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/gi

  private aggregationLock = false

  constructor (wsApplier: expressWs.Instance) {
    this.ownRouter = express.Router()
    wsApplier.applyTo(this.ownRouter)

    // Set tauPercentile before initializing the task
    // msf.antibiogo.trainingInformation = {
    //   ...msf.antibiogo.trainingInformation,
    //   tauPercentile: 0.9,
    //   byzantineRobustAggregator: true // Set tauPercentile to 0.9
    // };

    this.initTask()

    // this.ownRouter.get('/trigger-aggregation', async (req, res) => await this.aggregateCentroids(req, res))
    this.ownRouter.get('/trigger-aggregation', async (req, res) => {
      try {
        console.log("Triggering aggregation...");
        await this.aggregateCentroids(req, res);
      } catch (error) {
        console.error("Error in /antibiogo/trigger-aggregation:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    // PCA API
    this.ownRouter.get('/pca', (req, res) => this.performPCAWithContributions(req, res))

    this.ownRouter.get('/centroids', (req, res) => this.getClientContributions(req, res))
    // this.ownRouter.get('/', (_, res) => res.send(this.description + '\n'))

    // Add API for discard function
    this.ownRouter.get('/discard', async (req, res) => {
      if (this.asyncBuffer === undefined) {
        throw new Error('asyncBuffer is undefined, task not initialized');
      }

      this.asyncBuffer.buffer = this.asyncBuffer.buffer.clear();
      res.status(200).send('Discarded all centroids\n');
    });

    // Add API that does PCA on the model
    // this.ownRouter.get('/pca', async (req, res) => {
    //   if (this.asyncBuffer === undefined) {
    //     throw new Error('asyncBuffer is undefined, task not initialized');
    //   }

    //   try {
    //     const pcaResult = performPCA(this.centroids);
    //     res.status(200).json(pcaResult);
    //   } catch (error) {
    //     console.error('Error performing PCA:', error);
    //     res.status(500).send({ error: 'Internal Server Error' });
    //   }
    // });

    this.ownRouter.ws(this.buildRoute(), (ws, req) => {
      if (this.isValidUrl(req.url)) {
        this.handle(ws, req)
      } else {
        ws.terminate()
        ws.close()
      }
    })
  }

  private async aggregateCentroids (request: express.Request, response: express.Response): Promise<void> {
    if (this.asyncBuffer === undefined) {
      throw new Error('asyncBuffer is undefined, task not initialized');
    }

    if (this.aggregationLock === true) {
      response.status(503).send('Aggregation already in progress\n');
      return;
    }

    this.aggregationLock = true;
    try {
      console.log("Starting aggregation...");
      
      // Log the state of the asyncBuffer before updating weights
      console.log("Buffer content before update:", this.asyncBuffer.buffer.toArray());

      await this.asyncBuffer.updateWeights();

      // Log the state of the asyncBuffer after updating weights
      console.log("Buffer content after update:", this.asyncBuffer.buffer.toArray());

      console.log("Aggregation successful.");
    } catch (e) {
      console.error("Error during aggregation:", e);
      // release the lock if an error occurs
      this.aggregationLock = false;
      response.status(500).send('Error while aggregating\n');
      return;
    }

    response.status(200).send('Aggregation successful\n');
    this.aggregationLock = false;
  }

  private async getClientContributions (request: express.Request, response: express.Response): Promise<void> {
    if (this.asyncBuffer === undefined) {
      throw new Error('asyncBuffer is undefined, task not initialized')
    }

    // Debug: Log the buffer content
    console.log('Buffer content:', this.asyncBuffer.buffer.toArray())

    const data = await Promise.all(
      this.asyncBuffer.buffer
        .toArray()
        .map(async ([_, centroid]) =>
          await encodeCentroids(centroid)
    ))

    response.contentType('application/json')
    response.status(200).json(data)
  }

  protected initTask (): void {
    this.tasksStatus = this.tasksStatus.set(antibiogo.taskID, {
      isRoundPending: false,
      round: 0
    })

    this.centroids = readFromCsv(CONFIG.prototypicalPath)
    console.log('Centroids read from CSV:', this.centroids);

    // Uncomment lines here to do wihout tauPercentile
    // make it so values by default false
    const isByzantineRobust: boolean = false
    const tauPercentile: number = 0
    // const isByzantineRobust: boolean = antibiogo.trainingInformation?.byzantineRobustAggregator ?? false
    // const tauPercentile: number = antibiogo.trainingInformation?.tauPercentile ?? 0

    // Initialize tauPercentile value
    // const tauPercentile: number = 0.7

    console.log('Initializing task with tauPercentile cahnged:', tauPercentile);

    const buffer = new AsyncBuffer<Centroids>(
      antibiogo.taskID,
      async (centroids: Iterable<Centroids>) =>
        this.aggregateAndStoreCentroids(List(centroids), tauPercentile)
    )
    this.asyncBuffer = buffer

    this.asyncInformant = new AsyncInformant(buffer)
  }

  public get router (): express.Router {
    return this.ownRouter
  }

  // Current state of centroids on the server
  private centroids!: Centroids

  // model weights received from clients for a given task and round.
  private asyncBuffer!: AsyncBuffer<Centroids>
  // informants for each task.
  private asyncInformant!: AsyncInformant<Centroids>
  /**
   * Contains metadata used for training by clients for a given task and round.
   * Stored by task ID, round number and client ID.
   */
  private metadataMap = Map<number, Map<string, Map<string, string>>>()

  // Contains all successful requests made to the server.
  // TODO use real log system
  private logs = List<Log>()

  // Contains client IDs currently connected to one of the server.
  private clients = Set<string>()

  /**
   * Maps a task to a status object. Currently provides the round number and
   * round status for each task.
   */
  private tasksStatus = Map<TaskID, TaskStatus>()

  protected get description (): string {
    return 'Antibiogo FeAI Server'
  }

  protected buildRoute (): string {
    return '/:clientId'
  }

  public isValidUrl (url: string | undefined): boolean {
    const splittedUrl = url?.split('/')

    return (splittedUrl !== undefined && splittedUrl.length === 3 && splittedUrl[0] === '' &&
      this.isValidClientId(splittedUrl[1]) &&
      this.isValidWebSocket(splittedUrl[2]))
  }

  protected isValidClientId (clientId: string): boolean {
    return new RegExp(this.UUIDRegexExp).test(clientId)
  }

  protected isValidWebSocket (urlEnd: string): boolean {
    return urlEnd === '.websocket'
  }

  protected sendConnectedMsg (ws: WebSocket): void {
    const msg: messageGeneral = { type: clientConnected }
    ws.send(msgpack.encode(msg))
  }

  protected handle (
    ws: WebSocket,
    req: express.Request
  ): void {
    const clientId = req.params.clientId;

    ws.on('message', (data: Buffer) => {
      const msg = msgpack.decode(data);
      if (msg.type === clientConnected) {
        console.info('client', clientId, 'joined antibiogo task');

        this.clients = this.clients.add(clientId);

        this.logsAppend(clientId, RequestType.Connect, 0);
        this.sendConnectedMsg(ws);
      } else if (msg.type === messageTypes.postWeightsToServer) {
        const rawWeights = msg.weights;
        const round = msg.round;

        this.logsAppend(
          clientId,
          RequestType.PostAsyncWeights,
          round
        );

        if (!(
          Array.isArray(rawWeights) &&
          rawWeights.every((e) => typeof e === 'number')
        )) {
          throw new Error('invalid weights format');
        }

        // Decode and log the received centroids
        const centroids: Centroids = decodeCentroids(rawWeights);
        console.log(
          'received centroids from client', clientId,
          'for round', round,
          'centroids: positions=', centroids.positions.weights[0].dataSync(),
          'counters=', centroids.counts,
          'radius=', centroids.radius
        );

        const buffer = this.asyncBuffer;
        if (buffer === undefined) {
          throw new Error('post weight to unknown task:\'antibiogo\'');
        }

        buffer.add(clientId, centroids, round);
        console.info('added centroids from client', clientId, 'to buffer, current buffer size:', buffer.buffer.size);
      } else if (msg.type === messageTypes.pullServerStatistics) {
        // Get latest round
        const statistics = this.asyncInformant.getAllStatistics();

        const msg: pullServerStatistics = {
          type: messageTypes.pullServerStatistics,
          statistics: statistics ?? {}
        };
        ws.send(msgpack.encode(msg));
      }
    });
  }

  private aggregateAndStoreCentroids (
    centroids: List<Centroids>,
    tauPercentile?: number
  ): void {
    // Check if centroids being passed
    try {
      console.log('Calling aggregateCentroids');
      console.log('Current centroids:', this.centroids);
      console.log('Contributions:', centroids);
      console.log('Tau percentile:', tauPercentile);

      // Convert centroids to JSON strings for easy copying
      const currentCentroidsJson = JSON.stringify(this.centroids, null, 2);
      const contributionsJson = JSON.stringify(centroids, null, 2);
      console.log('Current centroids JSON:', currentCentroidsJson);
      console.log('Contributions JSON:', contributionsJson);
      
      this.centroids = aggregateCentroids(
        this.centroids,
        centroids,
        tauPercentile
      );
    } catch (error) {
      console.error('Error in aggregateAndStroeCentroids:', error);
      throw error;
    }

    // Save to local file system
    writeToCsv(CONFIG.prototypicalPath, this.centroids)
  }

  /**
   * Appends the given request to the server logs.
   * @param clientId
   * @param type
   * @param round
   */
  private logsAppend (
    clientId: string,
    type: RequestType,
    round: number | undefined = undefined
  ): void {
    if (round === undefined) {
      return
    }

    this.logs = this.logs.push({
      timestamp: new Date(),
      task: antibiogo.taskID,
      round,
      client: clientId,
      request: type
    })
  }

  // private performPCAWithContributions(req: express.Request, res: express.Response): void {
  //   console.log("Received request for PCA on centroids with contributions.");
  
  //   try {
  //     if (!this.centroids || this.centroids.positions.weights.length === 0) {
  //       throw new Error("No centroids available for PCA.");
  //     }
  
  //     // Extract weights from current centroids
  //     const currentWeightTensors: tf.Tensor[] = this.centroids.positions.weights;
  //     const currentNumericWeights: number[][] = currentWeightTensors.map(tensor => Array.from(tensor.dataSync()));
  
  //     console.log("Extracted current numeric weights for PCA:", currentNumericWeights);
  
  //     if (currentNumericWeights.length === 0 || currentNumericWeights[0].length === 0) {
  //       throw new Error("Weight extraction failed or empty data.");
  //     }
  
  //     // Perform PCA on current model
  //     const currentPCA = new PCA(currentNumericWeights);
  //     const transformedCurrent: number[][] = currentPCA.predict(currentNumericWeights, { nComponents: 2 }).to2DArray();
  
  //     console.log("PCA on current model completed:", transformedCurrent);
  
  //     // Create a temporary aggregated model (without modifying the real model)
  //     const tempAggregatedModel = this.mergeCentroidsWithClientModel(
  //       this.centroids,
  //       this.asyncBuffer?.buffer.entrySeq().toList() ?? List()
  //     );
  
  //     // Extract weights from aggregated model
  //     const aggregatedWeightTensors: tf.Tensor[] = tempAggregatedModel.positions.weights;
  //     const aggregatedNumericWeights: number[][] = aggregatedWeightTensors.map(tensor => Array.from(tensor.dataSync()));
  
  //     console.log("Extracted aggregated numeric weights for PCA:", aggregatedNumericWeights);
  
  //     // Perform PCA on aggregated model
  //     const transformedAggregated: number[][] = currentPCA.predict(aggregatedNumericWeights, { nComponents: 2 }).to2DArray();
  
  //     console.log("PCA on aggregated model completed:", transformedAggregated);
  
  //     // Extract labels and radii for both models
  //     const currentLabels = this.centroids.labels;
  //     const currentRadii = this.centroids.radius;
      
  //     const clientLabels = tempAggregatedModel.labels;
  //     const clientRadii = tempAggregatedModel.radius;
  
  //     // Normalize radius values separately for both models
  //     const maxCurrentRadius = Math.max(...currentRadii);
  //     const scaledCurrentRadii = currentRadii.map(r => (r / maxCurrentRadius) * 4); // Scale to reasonable size
  
  //     const scaledClientRadii = clientRadii.map(r => (r / maxCurrentRadius) * 4); // Scale with same weights
  
  //     // Send both PCA results, labels, and radii as JSON response
  //     res.status(200).json({
  //       current_pca_result: transformedCurrent,
  //       aggregated_pca_result: transformedAggregated,
  //       current_labels: currentLabels,
  //       current_radii: scaledCurrentRadii,
  //       aggregated_labels: clientLabels,
  //       aggregated_radii: scaledClientRadii
  //     });
  
  //   } catch (error) {
  //     console.error("Error performing PCA with contributions:", error);
  //     res.status(500).json({ error: "Internal Server Error" });
  //   }
  // }

  private async performPCAWithContributions(req: express.Request, res: express.Response): Promise<void> {
    console.log("Received request for PCA on centroids with contributions.");

    try {
        if (!this.centroids || this.centroids.positions.weights.length === 0) {
            throw new Error("No centroids available for PCA.");
        }

        // Extract weights from current centroids
        const currentWeightTensors: tf.Tensor[] = this.centroids.positions.weights;
        const currentNumericWeights: number[][] = currentWeightTensors.map(tensor => Array.from(tensor.dataSync()));

        console.log("Extracted current numeric weights for PCA:", currentNumericWeights);

        if (currentNumericWeights.length === 0 || currentNumericWeights[0].length === 0) {
            throw new Error("Weight extraction failed or empty data.");
        }

        // Perform PCA on current model
        const currentPCA = new PCA(currentNumericWeights);
        const transformedCurrent: number[][] = currentPCA.predict(currentNumericWeights, { nComponents: 2 }).to2DArray();

        console.log("PCA on current model completed:", transformedCurrent);

        if (!this.asyncBuffer) {
            throw new Error("Async buffer is not initialized.");
        }

        // Create a temporary aggregated model (without modifying the real model)
        console.log("Creating a temporary aggregated model...");

        const clientContributions = this.asyncBuffer.buffer.toArray().map(([_, centroid]) => centroid);
        if (clientContributions.length === 0) {
            console.warn("No client contributions available, using original model.");
        }

        // Aggregate client contributions into a temporary model
        const tempAggregatedModel = aggregateCentroids(
            this.centroids, // Original model
            List(clientContributions) // Client contributions
        );

        console.log("Temporary aggregation completed for PCA visualization.");

        // Extract weights from temporary aggregated model
        const aggregatedWeightTensors: tf.Tensor[] = tempAggregatedModel.positions.weights;
        const aggregatedNumericWeights: number[][] = aggregatedWeightTensors.map(tensor => Array.from(tensor.dataSync()));

        console.log("Extracted aggregated numeric weights for PCA:", aggregatedNumericWeights);

        // Perform PCA on aggregated model
        const transformedAggregated: number[][] = currentPCA.predict(aggregatedNumericWeights, { nComponents: 2 }).to2DArray();

        console.log("PCA on aggregated model completed:", transformedAggregated);

        // Extract labels and radii for both models
        const currentLabels = this.centroids.labels;
        const currentRadii = this.centroids.radius;

        const aggregatedLabels = tempAggregatedModel.labels;  // Temporary aggregated model's labels
        const aggregatedRadii = tempAggregatedModel.radius;  // Temporary aggregated model's radii

        // Normalize radius values separately for both models
        const maxCurrentRadius = Math.max(...currentRadii);
        const scaledCurrentRadii = currentRadii.map(r => (r / maxCurrentRadius) * 4); // Scale to reasonable size

        const scaledAggregatedRadii = aggregatedRadii.map(r => (r / maxCurrentRadius) * 4); // Scale with same weights

        // Send both PCA results, labels, and radii as JSON response
        res.status(200).json({
            current_pca_result: transformedCurrent,
            aggregated_pca_result: transformedAggregated,
            current_labels: currentLabels,
            current_radii: scaledCurrentRadii,
            aggregated_labels: aggregatedLabels,
            aggregated_radii: scaledAggregatedRadii
        });

    } catch (error) {
        console.error("Error performing PCA with contributions:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
  }

  private mergeCentroidsWithClientModel(
    currentModel: Centroids,
    clientContributions: List<[string, Centroids]>
  ): Centroids {
    console.log("Merging client contributions into a temporary model...");

    if (clientContributions.size === 0) {
      console.warn("No client contributions available.");
      return currentModel; // Return original model if no contributions exist
    }

    // Extract the latest client-contributed model (without modifying the actual model)
    const latestClientModel = clientContributions.last()?.[1];

    if (!latestClientModel || latestClientModel.positions.weights.length === 0) {
      console.warn("Invalid client model received.");
      return currentModel; // Return original model if client model is invalid
    }

    console.log("Client model successfully merged into a temporary version.");
    
    // Return a copy of the client model without modifying state
    return new Centroids(
      latestClientModel.positions,
      [...latestClientModel.radius],
      [...latestClientModel.counts],
      [...latestClientModel.labels]
    );
  }
}