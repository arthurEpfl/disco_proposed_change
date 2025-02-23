# Local Prototypical Federated Learning Scheme
This repository implements a local implementation of a federated prototypical learning scheme. The initial model is loaded from an external csv file and some examples of client contributions exist in the test cases.

# Environment

Project based off [node.js](https://nodejs.org/en/). We highly recommend using [nvm](https://github.com/nvm-sh/nvm) ([asdf](https://asdf-vm.com/) also works) for managing your node environment.
Once nvm is installed, you can run the following to download and activate an environment with node v16 and npm v8:

```
nvm install 16
nvm use 16
```

If you plan on using node for this project exclusively, you can set your default node/npm version to this project's by typing:

```
nvm alias default 16
```

# Starting server

Install the server's dependencies and run it

```
cd server/
npm install
npx tsx src/run_server.ts
```

Buffer pool of server initialized as empty. Server API:

 - antibiogo/centroids: client contributions.
 - antibiogo/trigger-aggregation: aggregate model on the server side with client contributions.
 - antibiogo/discard: empty buffer.
 - antibiogo/pca: pca calculation.
 - tasks/antibiogo: current prototypical model on server side.

# Web client for model-checkpoint

```
cd model-checkpoint/
npm install
npm run dev
```

This webpage is used on the server side to monitor client contributions. Buttons

- Aggregate: aggregate central model with client contributions (antibiogo/trigger-aggregation API call).
- Discard: empty buffer (antibiogo/discard API call).
- Fetch Updates: show client contributions (antibiogo/centroids API call).
- PCA view: Load PCA: Only works when buffer not empty, shows 2D visualization of current central server model and aggregated model with contributions (antibiogo/pca API call).

# Client contribution

Send a client contribution to buffer of central server:

```
cd dicojs_mod/
npm install
npm run test:fit_new //For client contribution of single embedding corresponding to an unknown label in current model.
// or
npm run test:fit_multiple //For client contribution of 3 embeddings (1 new, 2 already existing)
```

# Example run

Follow all above in order, choosing client contribution. Once contribution from client sent to buffer, go to model-checkpoint vue page, go to PCA model view to check out PCA view before executing aggregate button (pca only works when buffer non empty). Do aggregate to update model (you will see donwloaded csv file model.csv will be updated).

Warning on model-checkpoint website: might be slow (so is running the test case in dicojs_mod :( ), might need to refresh page after aggregation to show changes in central server model when pressing Fetch Model button.   

Note: big chunks of codebase commented (ex: aggregation for broken byzantine robust aggregation), to indicate what has been removed. In the case of the byzantine robust aggregator schema, it was broken and thus modified to adopt a classic aggregation schema always
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

Note: For elements removed, everything has been commented to show what has been removed, for updates, comment of old import path to the one referencing current disco to show difference.
