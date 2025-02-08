import * as msgpack from 'msgpack-lite'

import * as tf from '@tensorflow/tfjs'
import { weights as serialization } from '../../core/serialization/index.js'
import { WeightsContainer } from '../../core/weights/index.js'
// import { WeightsContainer } from '../../../../disco/discojs/src/weights/index.js';
import { Centroids } from '../weights/centroids.js'

/*
Methods to get the 4 components of centroid object (position, radius, counts, labels).
Also functions for encoding before sending between server and client, then decoding after message received.
*/

export class SerializedCentroids {
  constructor (
    private readonly _positions: serialization.Serialized[],
    private readonly _radius: number[],
    private readonly _counts: number[],
    private readonly _labels: string[]
  ) {}

  get positions (): serialization.Serialized[] {
    return this._positions
  }

  get radius (): number[] {
    return this._radius
  }

  get counts (): number[] {
    return this._counts
  }

  get labels (): string[] {
    return this._labels
  }
}


export async function encodeCentroids (centroids: Centroids): Promise<serialization.Encoded> {
  const serialized: serialization.Serialized[] = await Promise.all(centroids.positions.weights.map(async (t) => {
    return {
      shape: t.shape as number[],
      data: [...await t.data<'float32'>()],
    }
  }))

  const payload = new SerializedCentroids(
    serialized,
    centroids.radius,
    centroids.counts,
    centroids.labels
  )

  return [...msgpack.encode(payload).values()]
}

export function decodeCentroids (encoded: serialization.Encoded): Centroids {
  const raw = msgpack.decode(encoded)

  const rawPositions = raw._positions

  if (!(Array.isArray(rawPositions) && rawPositions.every(serialization.isSerialized))) {
    console.log("Error: raw._positions is not an array or not correctly serialized:", rawPositions);
    throw new Error('expected to decode an array of serialized weights')
  }

  const positions = new WeightsContainer(
    rawPositions.map((w) => tf.tensor(w.data, w.shape))
  )

  return new Centroids(
    positions,
    raw._radius,
    raw._counts,
    raw._labels
  )
}