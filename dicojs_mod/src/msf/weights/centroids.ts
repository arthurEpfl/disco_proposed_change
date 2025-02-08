import { List } from 'immutable'
import { WeightsContainer } from '../../core/weights/index.js'
// import { WeightsContainer } from '../../../../disco/discojs/src/weights/index.js';

import * as tf from '@tensorflow/tfjs'

/*
Centroids class extension of WeightsContainer, addition of radius, count and label.
*/


export type CentroidsJson = Array<{ position: number[], label: string, radius: number, count: number }>

export type CentroidEntry = [tf.Tensor, number, number, string]

export class Centroids {
  constructor (
    private readonly _positions: WeightsContainer,
    private readonly _radius: number[],
    private readonly _counts: number[],
    private readonly _labels: string[]
  ) {
    if (![_radius, _counts, _labels].every((e) =>
      e.length === _positions.weights.length)) {
      throw new Error('Expected args of same length')
    }
  }

  get positions (): WeightsContainer {
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

export function fromJson (json: CentroidsJson): Centroids {
  return new Centroids(
    new WeightsContainer(json.map((e) => e.position)),
    json.map((e) => e.radius),
    json.map((e) => e.count),
    json.map((e) => e.label)
  )
}

export function toJson (centroids: Centroids): CentroidsJson {
  const entries = toEntries(centroids)
  return entries.map(([position,  radius,  count,  label]) => {
    return {
      position: position.arraySync() as number[],
      radius,
      count,
      label
    }
  }).toArray()
}

export function isJson (raw: unknown): raw is CentroidsJson {
  if (!(
    typeof raw === 'object' &&
    raw !== null
  )) {
    return false
  }

  if (!Array.isArray(raw)) {
    return false
  }

  if (!raw.every((e) => {
    const { position, radius, count, label } = e as Record<string, string | number | number[]>
    return (
      Array.isArray(position) && position.every((p) => typeof p === 'number') &&
      typeof radius === 'number' &&
      typeof count === 'number' &&
      typeof label === 'string'
    )
  })) {
    return false
  }

  return true
}

export function fromEntries (entries: List<CentroidEntry>): Centroids {
  return new Centroids(
    new WeightsContainer(entries.map((e) => e[0])),
    entries.map((e) => e[1]).toArray(),
    entries.map((e) => e[2]).toArray(),
    entries.map((e) => e[3]).toArray()
  )
}

export function toEntries (centroids: Centroids): List <CentroidEntry> {
  return List(centroids.positions.weights).zip(
    List(centroids.radius),
    List(centroids.counts),
    List(centroids.labels)
  ) as List<CentroidEntry>
}
