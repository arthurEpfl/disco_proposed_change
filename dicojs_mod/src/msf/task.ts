import { data } from '../core/index.js'
import { Task, DataType } from '../core/task/index.js'

// All info associated to antibiogo task, every task defined unqiquely in DISCO.

export const antibiogo: Task<DataType> = {
  id: 'antibiogo',
  trainingInformation: {
    batchSize: 4,
    epochs: 0,
    minNbOfParticipants: 1,
    tensorBackend: 'tfjs',
    // preprocessingFunctions: [data.ImagePreprocessing.Resize],
    LABEL_LIST: ['0', '1'],
    validationSplit: 0,
    roundDuration: 5,
    dataType: 'image',
    scheme: 'federated',
    IMAGE_H: 64,
    IMAGE_W: 64
  },
  displayInformation: {
    taskTitle: 'Antibiogo',
    summary: {
      preview: "This is a brief preview of the content.",
      overview: "This overview provides a more detailed explanation of the content, summarizing key points and main ideas."
    }
  }
}