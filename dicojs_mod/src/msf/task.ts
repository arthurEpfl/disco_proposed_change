import { data } from '../core/index.js'
import { Task, DataType } from '../core/task/index.js'

// All info associated to antibiogo task, every task defined unqiquely in DISCO.

export const antibiogo: Task = {
  taskID: 'antibiogo',
  trainingInformation: {
    modelID: 'antibiogo-model',
    batchSize: 4,
    epochs: 0,
    // preprocessingFunctions: [data.ImagePreprocessing.Resize],
    LABEL_LIST: ['0', '1'],
    validationSplit: 0,
    roundDuration: 5,
    dataType: 'image',
    scheme: 'federated',
    modelCompileData: {
      optimizer: 'rmsprop',
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy']
    },
    IMAGE_H: 64,
    IMAGE_W: 64
  },
  displayInformation: {}
}