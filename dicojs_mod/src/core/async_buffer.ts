import { Map } from 'immutable'

import { AsyncInformant } from './async_informant.js'
import { TaskID } from './task/index.js'

/*
 * The AsyncWeightsBuffer class holds and manipulates information about the
 * async weights buffer. It works as follows:
 *
 * Setup: Init round to zero and create empty buffer (a map from user id to weights)
 *
 * - When a user adds weights only do so when they are recent weights: i.e. this.round - round <= roundCutoff.
 * - If a user already added weights, update them. (-> there can be at most one entry of weights per id in a buffer).
 * - When the buffer is full, call aggregateAndStoreWeights with the weights in the buffer and then increment round by one  and reset the buffer.
 *
 * taskID: corresponds to the task that weights correspond to.
 * bufferCapacity: size of the buffer.
 * buffer: holds a map of users to their added weights.
 * round: the latest round of the weight buffer.
 * roundCutoff: cutoff for accepted rounds.
 */
export class AsyncBuffer<T> {
  buffer: Map<string, T>
  round: number
  private observer: AsyncInformant<T> | undefined

  constructor (
    public readonly taskID: TaskID,
    private readonly aggregateAndStoreWeights: (weights: Iterable<T>) => Promise<void>,
    private readonly roundCutoff = 4
  ) {
    this.buffer = Map()
    this.round = 0
  }

  registerObserver (observer: AsyncInformant<T>): void {
    this.observer = observer
  }

  public async updateWeights (): Promise<void> {

    // Debug steps 
    console.log('Buffer size:', this.buffer.size);
    console.log('Buffer content:', this.buffer.toArray());

    await this.aggregateAndStoreWeights(this.buffer.values())

    this.round += 1
    this.observer?.update()
    this.buffer = Map()

    console.log('\n************************************************************')
    console.log(`Aggregating weights and starting round: ${this.round}\n`)
  }

  // TODO do not test private
  isNotWithinRoundCutoff (round: number): boolean {
    // Note that always this.round >= round
    return this.round - round > this.roundCutoff
  }

  /**
     * Add weights originating from weights of a given round.
     * Only add to buffer if the given round is not old.
     * @param weights
     * @param round
     * @returns true if weights were added, and false otherwise
     */
  add (id: string, weights: T, round: number): boolean {
    if (this.isNotWithinRoundCutoff(round)) {
      console.log(`Did not add weights of ${id} to buffer. Due to old round update: ${round}, current round is ${this.round}`)
      return false
    }

    const weightsUpdatedByUser = this.buffer.has(id)
    const msg = weightsUpdatedByUser ? '\tUpdating' : '-> Adding new'
    console.log(`${msg} weights of ${id} to buffer.`)

    this.buffer = this.buffer.set(id, weights)

    return true
  }
}
