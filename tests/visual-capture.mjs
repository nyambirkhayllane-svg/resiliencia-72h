import {spawn} from "node:child_process";
import {chromium} from "playwright-core";

const server=spawn(process.execPath,["tests/server.mjs"],{stdio:"ignore"});
await new Promise(resolve=>setTimeout(resolve,700));
const browser=await chromium.launch({headless:true,executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"});
for(const [name,viewport] of [["desktop",{width:1440,height:900}],["tablet",{width:820,height:1180}]]){
  const page=await browser.newPage({viewport});
  await page.goto("http://127.0.0.1:4173");
  await page.screenshot({path:`visual-${name}.png`,fullPage:true});
  await page.close();
}
await browser.close();
server.kill();
