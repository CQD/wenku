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

// 連續請求的最小間隔。太快會被 Cloudflare 流量限制擋下（回應是「error code: 1015」）
const FETCH_INTERVAL = 2500;
// 被擋下時的重試次數，每次等待時間加倍
const FETCH_RETRY = 4;

let lastFetchAt = 0;

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
    let volumn = normalizeVolumnTitle(book.volumnTitle);

    let config = {
        "outfile": `${book.title}-${volumn}`,
        "vertical": true,
        "metadata":{
            "title": `${book.title} ${volumn}`,
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

// 「第一卷」→「01」、「第十二卷」→「12」
// 中文數字用字串排序會亂掉（十一卷排在二卷前面），所以轉成補零的阿拉伯數字
// 卷名有多餘文字時只換掉數字部分，例如「第一卷 序章篇」→「01 序章篇」
// 認不出數字的卷名（例如「短篇集」）維持原樣
function normalizeVolumnTitle(volumnTitle){
    return volumnTitle
        .replace(/第\s*([零〇一二三四五六七八九十百千兩\d]+)\s*[卷部冊集]/, (match, num) => {
            let n = cn2int(num);
            return (null === n) ? match : String(n).padStart(2, '0');
        })
        .trim();
}

// 中文數字轉阿拉伯數字，支援到千位；認不出來時回傳 null
function cn2int(text){
    const DIGITS = {'零':0, '〇':0, '一':1, '二':2, '兩':2, '三':3, '四':4, '五':5, '六':6, '七':7, '八':8, '九':9};
    const UNITS = {'十':10, '百':100, '千':1000};

    if (/^\d+$/.test(text)) return parseInt(text, 10);

    let total = 0;
    let current = 0;
    for (let char of text) {
        if (char in DIGITS) {
            current = DIGITS[char];
        } else if (char in UNITS) {
            // 「十二」的十前面沒數字，視為一
            total += (current || 1) * UNITS[char];
            current = 0;
        } else {
            return null;
        }
    }

    return total + current;
}

async function extractCover(href){
    console.log(`從 ${href} 取得封面圖`);
    let html = await url2html(href);
    let { document } = new JSDOM(html).window;
    let link = document.querySelector('.divimage a');
    if (!link) {
        console.log(` - 警告：${href} 找不到插圖，這一卷不會有封面`);
        return null;
    }
    return link.href;
}


////////////////////////////////////////////////////////

async function url2html(url){
    for (let attempt = 1; ; attempt++) {
        // 距離上次請求不到 FETCH_INTERVAL 就先等，避免整份書目一次連發被擋
        let idle = lastFetchAt + FETCH_INTERVAL - Date.now();
        if (idle > 0) await sleep(idle);

        console.log(` - fetching ${url}`);
        let html = await exec(`curl -s '${url}' | iconv -f GB18030 | opencc`);
        lastFetchAt = Date.now();

        if (!isRateLimited(html)) return html;

        if (attempt >= FETCH_RETRY) {
            throw new Error(`${url} 連續 ${FETCH_RETRY} 次被流量限制擋下：${html.trim()}`);
        }

        let wait = FETCH_INTERVAL * Math.pow(2, attempt);
        console.log(` - 被流量限制擋下（${html.trim()}），等 ${wait / 1000} 秒後重試`);
        await sleep(wait);
    }
}

// Cloudflare 擋下時 HTTP 狀態仍然是 200，內文只有「error code: 1015」，
// 不特別檢查就會被當成正常頁面解析，然後靜默抓不到封面
function isRateLimited(html){
    return /^\s*error code: \d+\s*$/.test(html);
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
