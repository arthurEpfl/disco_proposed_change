import express from 'express'

import { CONFIG } from '../config.js'

import { antibiogo } from '../../../dicojs_mod/src/msf/task.js'

import { encodeCentroids, decodeCentroids } from '../../../dicojs_mod/src/msf/serialization/weights.js'

import { readFromCsv } from './centroids.js'

/*
Initialization of server launch. Define encoded and decoded centroids from csv,
which contains model currently on main server.
*/

export class Tasks {
  private readonly ownRouter: express.Router;

  constructor() {
    this.ownRouter = express.Router();

    this.ownRouter.get(`/${antibiogo.id}`, async (_, res) => {
      try {
        const centroids = readFromCsv(CONFIG.prototypicalPath);
        console.log('Original Centroids:', centroids);

        const encoded = await encodeCentroids(centroids);
        console.log('Encoded Centroids:', encoded);

        const decoded = decodeCentroids(encoded);
        console.log('Decoded Centroids:', decoded);

        res.send(encoded);
      } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
      }
    });
  }

  public get router(): express.Router {
    return this.ownRouter;
  }
}
