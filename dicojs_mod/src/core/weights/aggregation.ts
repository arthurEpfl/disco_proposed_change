// import { List } from 'immutable';
// import * as tf from '@tensorflow/tfjs'
// import { TensorLike, WeightsContainer } from './weights_container.js';

// /*
// Contains functions used for getting averaged centroids between the ones from main model
// and client contributions. Functions included for byzantine robust aggregation is broken,
// although already has working implementation in DISCO under Privacy.
// */

// type WeightsLike = Iterable<TensorLike>;

// function parseWeights(weights: Iterable<WeightsLike | WeightsContainer>): List<WeightsContainer> {
//   try {
//     // Log the type and value of each element in weights
//     for (const weight of weights) {
//       if (weight instanceof WeightsContainer) {
//         console.log('Type: WeightsContainer, Value:', weight);
//       } else if (Array.isArray(weight)) {
//         console.log('Type: Array, Value:', weight);
//       } else if (weight instanceof tf.Tensor) {
//         console.log('Type: tf.Tensor, Value:', weight);
//       } else {
//         console.log('Type: Unknown, Value:', weight);
//       }
//     }
//     const r = List(weights).map((w) =>
//       w instanceof WeightsContainer ? w : new WeightsContainer(w)
//     );
//     const weightsSize = r.first()?.weights.length;

//     if (weightsSize === undefined) {
//       throw new Error('no weights to work with');
//     }
//     if (!r.rest().isEmpty() && r.rest().every((w) => {
//       return w.weights.length !== weightsSize;
//     })) {
//       throw new Error('weights dimensions are different for some of the operands');
//     }

//     return r;
//   } catch (error) {
//     console.error('Error in parseWeights:', error);
//     throw error;
//   }
// }

// function centerWeights(weights: Iterable<WeightsLike | WeightsContainer>, currentModel: WeightsContainer): List<WeightsContainer> {
//   try {
//     // Inverse substraction to avoid negative when adding 0's in contributions
//     return parseWeights(weights).map(model => model.mapWith(currentModel, (a,b) => tf.sub(b, a)));
//   } catch (error) {
//     console.error('Error in centerWeights:', error);
//     throw error;
//   }
// }

// function clipWeights (modelList: List<WeightsContainer>, normArray: number[], tau: number): List<WeightsContainer> {
//   return modelList.map(weights => weights.map((w, i) => tf.prod(w, Math.min(1, tau / (normArray[i])))))
// }

// // function clipWeights(modelList: List<WeightsContainer>, normArray: number[], tau: number): List<WeightsContainer> {
// //   try {
// //     return modelList.map(weights =>
// //       weights.map((w, i) => {
// //         try {
// //           console.log(`tau:`, tau);
// //           console.log('normArray:', normArray[i]); 
// //           // const scaleFactor = Math.min(1, tau / (normArray[i]));
// //           const scaleFactor = normArray[i] === 0 ? 1 : Math.min(1, tau / normArray[i]);
// //           if (isNaN(scaleFactor)) {
// //             throw new Error(`Invalid scale factor: ${scaleFactor}`);
// //           }
// //           // console.log(`Scale factor for index ${i}: ${scaleFactor}`);
// //           // Multiply instead of tf.prod
// //           return tf.mul(w, scaleFactor);
// //         } catch (error) {
// //           console.error(`Error in weight mapping for index ${i}:`, error);
// //           throw error;
// //         } 
// //       })
// //     );
// //   } catch (error) {
// //     console.error('Error in clipWeights:', error);
// //     throw error;
// //   }
// // }

// // // Correct function to have 1 scale factor per label, not 1 per weight per label which makes no sense
// // function clipWeights(modelList: List<WeightsContainer>, normArray: number[], tau: number): List<WeightsContainer> {
// //   try {
// //     if (modelList.size !== normArray.length) {
// //       throw new Error(`Mismatch in lengths: modelList size is ${modelList.size}, but normArray length is ${normArray.length}`);
// //     }

// //     return modelList.map((weights, index) => {
// //       const norm = normArray[index];
// //       const scaleFactor = norm === 0 ? 1 : Math.min(1, tau / norm);
// //       console.log(`Scale factor for index ${index}: ${scaleFactor}`);
// //       console.log(`Norm for index ${index}: ${norm}`);
// //       if (isNaN(scaleFactor) || !isFinite(scaleFactor)) {
// //         throw new Error(`Invalid scale factor: ${scaleFactor}`);
// //       }

// //       return weights.map(w => tf.mul(w, scaleFactor));
// //     });
// //   } catch (error) {
// //     console.error('Error in clipWeights:', error);
// //     throw error;
// //   }
// // }

// function computeQuantile(array: number[], q: number): number {
//   try {
//     const sorted = array.sort((a, b) => a - b);
//     const pos = (sorted.length - 1) * q;
//     const base = Math.floor(pos);
//     const rest = pos - base;
//     if (sorted[base + 1] !== undefined) {
//       return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
//     } else {
//       return sorted[base];
//     }
//   } catch (error) {
//     console.error('Error in computeQuantile:', error);
//     throw error;
//   }
// }

// function reduce(
//   weights: Iterable<WeightsLike | WeightsContainer>,
//   fn: (a: tf.Tensor, b: tf.Tensor) => tf.Tensor
// ): WeightsContainer {
//   try {
//     return parseWeights(weights).reduce((acc: WeightsContainer, ws: WeightsContainer) =>
//       new WeightsContainer(acc.weights.map((w, i) => {
//         try {
//           return fn(w, ws.get(i) as tf.Tensor);
//         } catch (error) {
//           console.error(`Error in reduce operation at index ${i}:`, error);
//           throw error;
//         }
//       }))
//     );
//   } catch (error) {
//     console.error('Error in reduce:', error);
//     throw error;
//   }
// }

// export function sum(weights: Iterable<WeightsLike | WeightsContainer>): WeightsContainer {
//   try {
//     return reduce(weights, tf.add);
//   } catch (error) {
//     console.error('Error in sum:', error);
//     throw error;
//   }
// }

// export function diff(weights: Iterable<WeightsLike | WeightsContainer>): WeightsContainer {
//   try {
//     return reduce(weights, tf.sub);
//   } catch (error) {
//     console.error('Error in diff:', error);
//     throw error;
//   }
// }

// export function avg(weights: Iterable<WeightsLike | WeightsContainer>): WeightsContainer {
//   try {
//     const size = List(weights).size;
//     return sum(weights).map((ws) => ws.div(size));
//   } catch (error) {
//     console.error('Error in avg:', error);
//     throw error;
//   }
// }

// // See: https://arxiv.org/abs/2012.10333 
// export function avgClippingWeights(
//   peersWeights: Iterable<WeightsLike | WeightsContainer>,
//   currentModel: WeightsContainer,
//   tauPercentile: number
// ): WeightsContainer {
//   console.log('Starting avgClippingWeights with tauPercentile:', tauPercentile);
//   console.log('Peers weights:', peersWeights);
//   console.log('Current model:', currentModel);

//   try {
//     // Computing the centered peers weights with respect to the previous model aggregation
//     const centeredPeersWeights: List<WeightsContainer> = centerWeights(peersWeights, currentModel);
//     console.log('Centered peers weights:', centeredPeersWeights);

//     // Computing the Matrix Norm (Frobenius Norm) of the centered peers weights
//     const normArray: number[] = Array.from(centeredPeersWeights.map(model => model.frobeniusNorm()));
//     console.log('Norm array:', normArray);

//     // Computing the parameter tau as third percentile with respect to the norm array
//     const tau: number = computeQuantile(normArray, tauPercentile);
//     console.log('Computed tau:', tau);

//     // Computing the centered clipped peers weights given the norm array and the parameter tau
//     const centeredMean: List<WeightsContainer> = clipWeights(centeredPeersWeights, normArray, tau);
//     console.log('Centered clipped peers weights:', centeredMean);

//     // Aggregating all centered clipped peers weights
//     const result = avg(centeredMean);
//     console.log('Aggregated result:', result);

//     return result;
//   } catch (error) {
//     console.error('Error in avgClippingWeights:', error);
//     throw error;
//   }
// }
