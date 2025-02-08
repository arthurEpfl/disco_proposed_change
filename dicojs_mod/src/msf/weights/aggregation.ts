import { List } from 'immutable'

import { aggregation } from '../../core/weights/index.js'
import { Centroids, CentroidEntry, fromEntries, toEntries } from './centroids.js'

/*
Functions to get new centroids aggregated on client side.
*/

export function aggregateCentroids (
  centroids: Centroids,
  contributions: List<Centroids>,
  tauPercentile?: number
): Centroids {
  console.log('Starting aggregateCentroids');
  console.log('Starting aggregateCentroids');

  console.log('Centroids:', centroids);
  console.log('Contributions:', contributions);
  console.log('Tau percentile:', tauPercentile);

  try {
    if (!contributions.every((contribution) => {
      // console.log('Contribution:', contribution);
      // console.log('Contribution positions:', contribution.positions);
      // console.log('Contribution weights:', contribution.positions.weights);
      // console.log('Contribution weights[0]:', contribution.positions.weights[0]);
      return contribution.positions.weights[0].shape[0] === centroids.positions.weights[0].shape[0];
    })) {
      throw new Error('Centroid positions shape mismatch');
    }
  } catch (error) {
    console.error('Error checking centroid positions shape:', error);
    throw error;
  }

  // try {
  //   if (!contributions.every((contribution) => contribution.counts.length >= centroids.counts.length)) {
  //     throw new Error('Centroids counts length mismatch');
  //   }
  // } catch (error) {
  //   console.error('Error checking centroid counts length:', error);
  //   throw error;
  // }

  console.log('Contributions:', contributions);

  let knownCentroids;
  try {
    // Handle updated centroids with known labels
    knownCentroids = contributions
      .map((contribution) => toEntries(contribution)
        .take(centroids.labels.length))
      .filter((es) => es
        .zip(List(centroids.labels))
        .every(([e, l]) => e[3] === l));
  } catch (error) {
    console.error('Error processing known centroids:', error);
    throw error;
  }

  let knownPositions;
  try {
    knownPositions = knownCentroids.map((clientCentroids) =>
      clientCentroids.map((e) => e[0]));
  } catch (error) {
    console.error('Error processing known positions:', error);
    throw error;
  }

  // Don't filter out labels without contriubtions, make them 0 tensors to work with AvgClippingWeights
  // let knownPositions;
  // try {
  //   const allLabels = centroids.labels;
  //   knownPositions = allLabels.map((label, idx) => {
  //     const contribution = knownCentroids.find((clientCentroids) =>
  //       clientCentroids.some((e) => e[3] === label));
  //     if (contribution) {
  //       return contribution.map((e) => e[0]);
  //     } else {
  //       // Add zero weights for labels not in contributions
  //       return List(Array(centroids.positions.get(0).size).fill(0));
  //     }
  //   });
  // } catch (error) {
  //   console.error('Error processing known positions:', error);
  //   throw error;
  // }

  console.log('Centoids.positions:', centroids.positions);
  console.log('Known positions:', knownPositions);


  let averagedPositions;
  try {
    averagedPositions = tauPercentile !== undefined && tauPercentile > 0 && tauPercentile < 1
    // just use .avg everytime for now
      // ? aggregation.avgClippingWeights(knownPositions, centroids.positions, tauPercentile)
      ? aggregation.avg(knownPositions)
      : aggregation.avg(knownPositions);
    // averagedPositions = aggregation.avg(knownPositions);
  } catch (error) {
    console.error('Error averaging positions:', error);
    throw error;
  }

  console.log('Averaged positions:', averagedPositions);

  let knownCounts;
  try {
    knownCounts = knownCentroids.map((contribution) =>
      contribution.map((e, idx) =>
        e[2] - centroids.counts[idx]))
      .reduce((acc: number[], counts) =>
        acc.map((count, idx) =>
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          count + counts.get(idx)!), centroids.counts);
  } catch (error) {
    console.error('Error processing known counts:', error);
    throw error;
  }

  let updatedCentroids;
  try {
    updatedCentroids = toEntries(new Centroids(
      averagedPositions,
      centroids.radius,
      knownCounts,
      centroids.labels
    ));
  } catch (error) {
    console.error('Error creating updated centroids:', error);
    throw error;
  }

  let unknownCentroids;
  try {
    // Handle new labels
    unknownCentroids = contributions
      .map((contribution) => toEntries(contribution)
        .slice(centroids.labels.length))
      .filter((e) => e.size > 0);
  } catch (error) {
    console.error('Error processing unknown centroids:', error);
    throw error;
  }

  try {
    if (unknownCentroids.size === 0) {
      // Reorder everything by label and update model
      return fromEntries(updatedCentroids);
    } else {
      const perLabel = unknownCentroids.flatMap((e) => e).groupBy((e) => e[3]);
      const newCentroids = perLabel
        .map((es) => {
          const [p, r, c, l]: CentroidEntry = es.reduce((acc: CentroidEntry, e) => [
            acc[0].add(e[0]),
            acc[1] + e[1],
            acc[2] + e[2],
            acc[3]
          ]);
          const size = es.count();
          return [p.div(size), r / size, c, l] as CentroidEntry;
        })
        .toList();

      // Reorder everything by label and update model
      console.log('updatedCentroids:', updatedCentroids); 
      return fromEntries(updatedCentroids.concat(newCentroids).sortBy((e) => e[3]));
    }
  } catch (error) {
    console.error('Error handling new labels and updating model:', error);
    throw error;
  }
}