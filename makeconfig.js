#!/usr/bin/env node

const { JSDOM } = require("jsdom");
const realexec = require("child_process").exec;
const fs = require("fs");
const process = require('process');

if (process.argv.length < 3) {
    console.log("用法：makeconfig.js {書目網址}");
    return;
}

const BASEDIR = './build';

main();

////////////////////////////////////////////////////////

async function main() {
    let indexUrl = process.argv[2];
    let bookBasePath = indexUrl.replace(/\/[^/]*$/, '');

    let book = {
        title: '書名',
        volumnTitle: '冊名',
        author: '作者',
        cover: '封面',
        subject: ['奇幻'],
    }

    fs.existsSync(BASEDIR) || fs.mkdirSync(BASEDIR);

    console.log(`從 ${indexUrl} 撈取書籍資料`);
    let html = await url2html(indexUrl);
    let { document } = new JSDOM(html).window;

    book.title = document.querySelector('#title').textContent.replace(/\([^)]+\)$/, '');
    book.author = document.querySelector('#info').textContent.trim().replace(/^作者：/, '');

    let tds = document.querySelectorAll('td');

    let urls = [];
    for (let idx in tds) {
        let td = tds[idx];

        let textContent = td.textContent || '';
        textContent = textContent.trim();
        if ( !textContent ) continue;

        switch (td.className) {
            case "vcss":
                urls.length && makeConfig(book, urls);
                urls = [];
                book.volumnTitle = textContent;
                book.cover = null;
                break;
            case "ccss":
                let a = td.querySelector('a');
                let href = (0 === a.href.indexOf('http')) ? a.href : `${bookBasePath}/${a.href}`;
                if ('插圖' === a.textContent) {
                    book.cover = await extractCover(href);
                } else {
                    urls.push(href);
                }
                break;
        }
    };
    urls.length && makeConfig(book, urls);

    console.log('完成');
}

async function makeConfig(book, urls){
    let config = {
        "outfile": `${book.title}-${book.volumnTitle}`,
        "metadata":{
            "title": `${book.title} ${book.volumnTitle}`,
            "author": book.author,
            "language": 'zh-tw',
            "subject": book.subject,
        },
        "urls": urls,
        "cover": book.cover,
    };

    let configFile = `${BASEDIR}/${config.outfile}.json`;
    await text2File(`${configFile}`, JSON.stringify(config, null, 2));
    console.log(`已寫入 ${configFile}`)
}

async function extractCover(href){
    console.log(`從 ${href} 取得封面圖`);
    let html = await url2html(href);
    let { document } = new JSDOM(html).window;
    let link = document.querySelector('.divimage a');
    return link ? link.href : null;
}


////////////////////////////////////////////////////////

async function url2html(url){
    console.log(` - fetching ${url}`);
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
