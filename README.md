# KHM Converter

Tools for reading .khm files and converting .glb files into .khm format

## Usage

Parsing a .khm file

```
import { KHMLoader } from './khmModel.js';

const loader = new KHMLoader(buffer);
const { model } = loader.loadModel();
```

Writing a .khm file

```
import { KHMWriter } from './khmWriter.js';

const writer = new KHMWriter(model);
writer.writeKHM(model);
const blob = new Blob([new Uint8Array(writer.buffer)], { type: 'application/octet-stream' });
```

## Running the Demo

This project includes a simple web application in the `/examples` directory to demonstrate the KHM loading and writing functionality directly in your browser. To run it:

1.  Navigate to the `/examples` directory
2.  Start a local HTTP server to serve the `index.html` file
