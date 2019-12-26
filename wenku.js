#!/usr/bin/env node

const { JSDOM } = require("jsdom");
const realexec = require("child_process").exec;
const fs = require("fs");
const process = require('process');

if (process.argv.length < 3) {
    console.log("用法：wenku.js {config.json}");
    return;
}

const CONFIG = JSON.parse(fs.readFileSync( process.argv[2] ));
const BASEDIR = './build';

CONFIG.removeExtra = [];

main();

////////////////////////////////////////////////////////

async function main() {
    fs.existsSync(BASEDIR) || fs.mkdirSync(BASEDIR);

    if (CONFIG.cover.match(/https?:\/\//)) {
        let coverLocalPath = `${BASEDIR}/tmpcover.jpg`;
        await exec(`curl -s ${CONFIG.cover} > ${coverLocalPath}`);
        CONFIG.cover = coverLocalPath;
        CONFIG.removeExtra.push('tmpcover.jpg');
    }

    let jobs = CONFIG.urls.map(url2Markdown);
    let files = await Promise.all(jobs);

    await makeSummary(files);
    await makeEpub(files);
    await removeTmpFiles(files);

    console.log('完成');
}

////////////////////////////////////////////////////////

async function url2Markdown(url, idx) {
    console.log(`正在撈取 ${url}`);
    idx++; // 0 based 轉換成 1 based

    // 抓 html
    let html = await fetchHtml(url);

    // 解析 HTML，轉換成像是 markdown 的東西
    let { document } = new JSDOM(html).window;

    let title = document.querySelector('#title').textContent || "第 ${idx} 章";

    let content = document.querySelector('#content');
    content.querySelectorAll('#contentdp').forEach(e => {
        content.removeChild(e);
    })

    content = content.textContent
        .replace(/\u00a0/g, "")
        .replace(/^[*●]+$/gm, "----")
        .trim();
    content = `# ${title} {#ch${idx}}\n\n${content}\n`;

    // 存檔
    let filename = `${idx}.md`.padStart(6, '0');
    await text2File(`${BASEDIR}/${filename}`, content);

    // 收尾
    console.log(`已儲存 ${filename}，標題：${title}`);
    return {filename: filename, title: title, idx: idx};
}

async function makeSummary(files){
    let text = "## 目錄 {epub:type=index}\n\n";
    files.forEach(file => {
        text += `* [${file['title']}](#ch${file['idx']})\n`
    });

    let p1 = text2File(`${BASEDIR}/SUMMARY.md`, text);

    text = "---\n";
    for (let field in CONFIG.metadata) {
        text += `${field}: ${CONFIG.metadata[field]}\n`;
    }
    text += "...\n"
    let p2 = text2File(`${BASEDIR}/title.yaml`, text);

    return Promise.all([p1, p2]);
}

async function removeTmpFiles(files){
    files = files.map(file => file.filename);
    files.push('SUMMARY.md');
    files.push('title.yaml');

    CONFIG.removeExtra.forEach(f => files.push(f));

    return exec(`rm ${BASEDIR}/${files.join(` ${BASEDIR}/`)}`);
}

async function makeEpub(files){
    let docs = ['title.yaml', 'SUMMARY.md'];
    files.forEach(file => docs.push(file.filename));

    let cmd = `pandoc -t epub3 --css style/main.css --epub-cover-image ${CONFIG.cover}  -o '${BASEDIR}/${CONFIG.outfile}.epub' ${BASEDIR}/${docs.join(` ${BASEDIR}/`)}`;
    console.log(cmd);

    return exec(cmd);
}

async function fetchHtml(url) {
    return exec(`curl -s '${url}' | iconv -f GB18030 | opencc`);
}

async function text2File(filename, content) {
    return new Promise( (resolve, reject) => {
        fs.writeFile(filename, content, err => {
            if (err) {
                reject(err);
                return;
            }
            resolve();
        })
    });
}

async function exec(cmd) {
    return new Promise((resolve, reject) => {
        realexec(cmd, (error, stdout, stderr) => {
            let  bad = (error ? error.message : null) || stderr;
            if (bad) {
                reject(bad);
                return;
            }
            resolve(stdout);
        });
    });
}

var escapeDocument;
function escapeHtml(dirtyText){
    escapeDocument = escapeDocument || new JSDOM().window.document;
    let p = escapeDocument.createElement('p');
    p.textContent = dirtyText;
    return p.innerHTML;
}
