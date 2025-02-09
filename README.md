# Local Prototypical Federated Learning Scheme

Same instructions as for the antibiogo_localwork repository.

# DISCO repository import
The Disco repository is added as a submodule due to technical reasons (errors when using DISCO as a module in the npm register). 

# DISCO components integrated

The dicojs_mod/core folder contains the components of an outdated version of DISCO. The following elements were integrated:

 - core/weights/index.ts: replaced WeightsContainer and aggregation components of with their current DISCO version.
 - core/task/index.ts: replaced all components to define task by their current DISCO version.

# Elements removed:

The following elements were removed, they are irrelevant in the use case of prototypical learning which starts directly from the embeddings and doesn't have a "classic" machine learning algorithm for weight updates:

 - core/dataset: removed components to load and preprocess image data.
 - core/serialialization/model.ts: removed encoding components for gpt-tfjs models.
