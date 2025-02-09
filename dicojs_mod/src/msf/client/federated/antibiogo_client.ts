import { v4 as randomUUID } from 'uuid'
import axios from 'axios'

import * as messages from '../../../core/client/federated/messages.js'
import { privacy } from '../../../core/index.js'
import { informant } from '../../../core/informant/index.js'
import { type, clientConnected } from '../../../core/client/messages.js'
// import { ClientConnected } from '../../../../../disco/discojs/src/client/messages.js';
// import { type } from '../../../../../disco/discojs/src/client/messages.js'
import { EventConnection, waitMessageWithTimeout, WebSocketServer } from '../../../core/client/event_connection.js'
import { MAX_WAIT_PER_ROUND } from '../../../core/client/utils.js'
import { Centroids } from '../../weights/centroids.js'
import { decodeCentroids, encodeCentroids } from '../../serialization/weights.js'
import { antibiogo } from '../../task.js'

import { Task, DataType } from '../../../core/task/index.js'

/*
Class that deals with communication with the centralized server when training a specific task in the federated setting.
Class contains functions all for establishing and ending connection between client and server, sending and receiving messages. 
*/
export class AntibiogoClient {
  protected connected = false
  public readonly task: Task<DataType> = antibiogo

  constructor (
    public readonly url: URL
  ) {}

  private readonly clientID = randomUUID()
  private readonly peer: any
  private round = 0

  protected _server?: EventConnection

  // Attributes used to wait for a response from the server
  private serverRound?: number
  private centroids?: Centroids
  private receivedStatistics?: Record<string, number>
  private metadataMap?: Map<string, unknown>

  public get server (): EventConnection {
    if (this._server === undefined) {
      throw new Error('server undefined, not connected')
    }
    return this._server
  }

  // It opens a new WebSocket connection and listens to new messages over the channel
  private async connectServer (url: URL): Promise<EventConnection> {
    const server: EventConnection = await WebSocketServer.connect(url, messages.isMessageFederated, messages.isMessageFederated)

    return server
  }

  /**
   * Initialize the connection to the server. TODO: In the case of FeAI,
   * should return the current server-side round for the task.
   */
  async connect (): Promise<void> {
    // const URL = typeof window !== 'undefined' ? window.URL : nodeUrl.URL
    const serverURL = new URL('', this.url.href)
    switch (this.url.protocol) {
      case 'http:':
        serverURL.protocol = 'ws:'
        break
      case 'https:':
        serverURL.protocol = 'wss:'
        break
      default:
        throw new Error(`unknown protocol: ${this.url.protocol}`)
    }
    serverURL.pathname += `antibiogo/${this.clientID}`
    this._server = await this.connectServer(serverURL)
    const msg: clientConnected = {
      type: type.clientConnected
    }
    this.server.send(msg)
    await waitMessageWithTimeout(this.server, type.clientConnected, MAX_WAIT_PER_ROUND)
    this.connected = true
  }

  /**
   * Disconnection process when user quits the task.
   */
  async disconnect (): Promise<void> {
    this.server.disconnect()
    this._server = undefined
    this.connected = false
  }

  // It sends a message to the server
  private sendMessage (msg: messages.MessageFederated): void {
    this.server?.send(msg)
  }

  // It sends weights to the server
  async postWeightsToServer (centroids: Centroids): Promise<void> {
    const msg: messages.postWeightsToServer = {
      type: type.postWeightsToServer,
      weights: await encodeCentroids(centroids),
      round: this.round
    }
    this.sendMessage(msg)
  }

  // It retrieves the last server round and weights, but return only the server round
  async getLatestServerRound (): Promise<number | undefined> {
    this.serverRound = undefined
    this.centroids = undefined

    const msg: messages.messageGeneral = {
      type: type.latestServerRound
    }
    this.sendMessage(msg)

    const received = await waitMessageWithTimeout(this.server, type.latestServerRound, MAX_WAIT_PER_ROUND)

    this.serverRound = received.round
    this.centroids = decodeCentroids(received.weights)

    return this.serverRound
  }

  // It retrieves the last server round and weights, but return only the server weights
  async pullRoundAndFetchWeights (): Promise<Centroids | undefined> {
    // get server round of latest model
    await this.getLatestServerRound()

    if (this.round < (this.serverRound ?? 0)) {
      // Update the local round to match the server's
      this.round = this.serverRound as number
      return this.centroids
    } else {
      return undefined
    }
  }

  // It pulls statistics from the server
  async pullServerStatistics (
    trainingInformant: informant.FederatedInformant
  ): Promise<void> {
    this.receivedStatistics = undefined

    const msg: messages.messageGeneral = {
      type: type.pullServerStatistics
    }
    this.sendMessage(msg)

    const received = await waitMessageWithTimeout(this.server, type.pullServerStatistics, MAX_WAIT_PER_ROUND)
    this.receivedStatistics = received.statistics

    trainingInformant.update(this.receivedStatistics ?? {})
  }

  // Same here, function never used in the codebase, useless
  // It posts a new metadata value to the server
  // async postMetadata (metadataID: string, metadata: string): Promise<void> {
  //   const msg: messages.postMetadata = {
  //     type: type.postMetadata,
  //     taskId: this.task.id,
  //     clientId: this.clientID,
  //     round: this.round,
  //     metadataId: metadataID,
  //     metadata: metadata
  //   }

  //   this.sendMessage(msg)
  // }

  // This function is never used in the codebase, useless
  // It gets a metadata map from the server
  // async getMetadataMap (
  //   metadataId: string
  // ): Promise<Map<string, unknown> | undefined> {
  //   this.metadataMap = undefined

  //   const msg: messages.getMetadataMap = {
  //     type: type.getMetadataMap,
  //     taskId: this.task.id,
  //     clientId: this.clientID,
  //     round: this.round,
  //     metadataId: metadataId
  //   }

  //   this.sendMessage(msg)

  //   const received = await waitMessageWithTimeout(this.server, type.getMetadataMap, MAX_WAIT_PER_ROUND)
  //   if (received.metadataMap !== undefined) {
  //     this.metadataMap = new Map(received.metadataMap)
  //   }

  //   return this.metadataMap
  // }

  async onRoundEndCommunication (
    updatedCentroids: Centroids,
    staleCentroids: Centroids,
    _: number,
    trainingInformant: informant.FederatedInformant
  ): Promise<Centroids> {
    // Here, for our use case, addDiffPrivacy will just return same. Since no clippingRadius or noiseScale is defined.
    const noisyCentroids = privacy.addDifferentialPrivacy(
      updatedCentroids.positions,
      staleCentroids.positions,
      this.task
    )
    const payload = new Centroids(
      noisyCentroids,
      updatedCentroids.radius,
      updatedCentroids.counts,
      updatedCentroids.labels
    )
    await this.postWeightsToServer(payload)

    await this.pullServerStatistics(trainingInformant)

    const serverWeights = await this.pullRoundAndFetchWeights()
    return serverWeights ?? staleCentroids
  }

  async onTrainEndCommunication (): Promise<void> {}

  async getLatestModel (): Promise<Centroids> {
    const url = new URL('', this.url.href)
    if (!url.pathname.endsWith('/')) {
      url.pathname += '/'
    }
    url.pathname += `tasks/${this.task.id}`
    const response = await axios.get(url.href)

    return decodeCentroids(response.data)
  }

  get isConnected (): boolean {
    return this.connected
  }
}
