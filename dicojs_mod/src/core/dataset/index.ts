// export type { Dataset } from './dataset.js'
// export { ImagePreprocessing } from './data/preprocessing.js'
// import { Data } from './data/data.js'
// import { DataSplit } from './data/data_split.js'
// import { ImageData } from './data/image_data.js'
// export { ImageLoader } from './data_loader/image_loader.js'

/*
The /core/dataset folder contains methods for training models. 
For instance, preprocessing.ts contains a normalization function for the image.
However, in current state of the art, the model starts directly from latent space embeddings, 
meaning that the functions here for preprocessing data and training the neural network are not relevant
in our use case.
*/