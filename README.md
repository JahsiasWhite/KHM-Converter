# KHM Converter

Tools for reading .khm files and converting .glb files into .khm format. Includes a browser-based demo to test functionality.

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

Start the server and open the browser demo:

```
python server.py
```

Open http://localhost:8000/examples/
