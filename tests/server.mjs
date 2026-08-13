import http from "node:http";
import {readFile} from "node:fs/promises";
import {extname,join,normalize} from "node:path";
const root=process.cwd(),types={".html":"text/html",".js":"text/javascript",".css":"text/css",".png":"image/png"};
http.createServer(async(req,res)=>{try{const name=req.url==="/"?"index.html":req.url.split("?")[0].slice(1),path=normalize(join(root,name));if(!path.startsWith(root))throw new Error("invalid path");const body=await readFile(path);res.writeHead(200,{"content-type":types[extname(path)]||"application/octet-stream"});res.end(body)}catch{res.writeHead(404);res.end("Not found")}}).listen(4173,"127.0.0.1");
