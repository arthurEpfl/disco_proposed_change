import { List, Map } from 'immutable'
import * as tf from '@tensorflow/tfjs'
import { WeightsContainer } from '../../core/weights/index.js'
// import { WeightsContainer } from '../../../../disco/discojs/src/weights/index.js';
import { informant } from '../../core/informant/index.js'
import { Centroids } from '../weights/centroids.js'

/*
Class to make the prediction based on new embedding, update the prototypes accordingly. 
Fix: if embedding labelled as a new label, the radius defined as average of all other existing prototypes radiuses.
*/

export class PrototypicalTrainer {
  constructor (
    public readonly trainingInformant: informant.FederatedInformant,
    // Do we want the Antibiogo app to provide starting prototypes on download?
    private _prototypes: Centroids,
    private readonly radiusCoefficient: number = 2
  ) {

  }

  /**
   * @param dataset Collection of embedded pellets
   * @returns The predictions set for each pellet
   */
  predict (dataset: tf.Tensor1D[]): string[][] {
    return dataset.map((tensor) =>
      this._prototypes.positions.weights
        .map((centroid, idx) =>
          [
            centroid.sub(tensor).norm(2).dataSync()[0],
            this._prototypes.labels[idx]
          ] as [number, string])
        .filter(([distance, _], idx) =>
          distance <= this._prototypes.radius[idx])
        .map(([_, label]) => label))
  }

  /**
   * Performs a K-Means update on the held prototypes.
   * @param dataset The pellets to train on
   * @param labels The labels corresponding to the given pellets
   */
  trainModel (dataset: tf.Tensor[], labels: string[]): void {
    // Get a list of data points for each label
    const pelletsPerLabel = Map(List(labels)
      .zip(List(dataset))
      .groupBy(([label, _]) => label))
      .map((es) => es.map(([_, sample]) => sample).toList())

    // New labels entered by the user
    const newLabels = List(labels)
      .filter((label) => !this._prototypes.labels.includes(label))

    // Update local prototypes
    const updatedCentroids = List(this._prototypes.positions.weights)
      .zip(List(this._prototypes.counts))
      .map(([centroid, count], idx) => {
        const label = this._prototypes.labels[idx]
        if (label === undefined) {
          throw new Error(`Centroid ${idx} does not have a label`)
        }

        const pellets = pelletsPerLabel.get(label)

        if (pellets === undefined) {
          return [undefined, undefined] as [undefined, undefined]
        }

        const newCount = count + pellets.size
        const newPosition = centroid
          .mul(count)
          .add(pellets.reduce((acc: tf.Tensor, e) => acc.add(e)))
          .div(newCount)

        // Calculate the change in centroid position
        const change = newPosition.sub(centroid).norm(2).dataSync()[0]
        console.log(`Centroid for label ${label} changed by ${change}`)

        return [
          newPosition,
          newCount
        ] as [tf.Tensor, number]
      })

    const updatedPositions = updatedCentroids
      .map(([position, _], idx) => position ?? this._prototypes.positions.get(idx)) as List<tf.Tensor>
    const updatedCounts = updatedCentroids
      .map(([_, count], idx) => count ?? this._prototypes.counts[idx])

    // Calculate the average radius of existing centroids
    const existingRadii = this._prototypes.radius
    const avgExistingRadius = existingRadii.reduce((acc, r) => acc + r, 0) / existingRadii.length

    // Add prototypes for new labels
    const newCentroids = newLabels
      .map((label) => {
        const pellets = pelletsPerLabel.get(label) as List<tf.Tensor>
        const position = pellets.reduce((acc: tf.Tensor, t) => acc.add(t)).div(pellets.size)

        const distances = pellets
          .map((p) => p.sub(position).norm(2).dataSync()[0])
        const avgDistance = distances
          .reduce((acc: number, e) => acc + e) / pellets.size
        const stddev = Math.sqrt(distances
          .map((d) => (d - avgDistance) ** 2)
          .reduce((acc: number, e) => acc + e) / Math.max(pellets.size - 1, 1))

        // Set radius for new centroid with single embedding
        const radius = pellets.size > 1 ? avgDistance + this.radiusCoefficient * stddev : avgExistingRadius

        console.log(`New centroid for label ${label}: position=${position}, count=${pellets.size}, radius=${radius}`)

        return [
          position,
          pellets.size,
          radius
        ] as [tf.Tensor, number, number]
      })

    const newPositions = newCentroids.map(([position, c, r]) => position)
    const newRadiuses = newCentroids.map(([p, c, radius]) => radius)
    const newCounts = newCentroids.map(([p, count, r]) => count)

    console.log(`New positions: ${newPositions}`)
    console.log(`New radiuses: ${newRadiuses}`)
    console.log(`New counts: ${newCounts}`)

    this._prototypes = new Centroids(
      new WeightsContainer(updatedPositions.concat(newPositions)),
      this._prototypes.radius.concat(newRadiuses.toArray()),
      updatedCounts.concat(newCounts).toArray(),
      this._prototypes.labels.concat(newLabels.toArray())
    )
  }

  get prototypes (): Centroids {
    return this._prototypes
  }
}

