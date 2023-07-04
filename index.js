const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const superagent = require('superagent')
const OSS = require('ali-oss')
const request = require('request-promise')

let root
const md5s = {}
let store
let remote_path

exports.update = async function ({ access, key, bucket, region, target, directory, remote }) {
    store = new OSS({
        accessKeyId: access,
        accessKeySecret: key,
        bucket: bucket,
        region: region,
    })

    root = path.resolve(directory)
    console.log('directory:', root)
    remote_path = target || ''

    const rmd5s = await request.get(`${remote}/.md5`, { json: true }).catch(console.error)
    const files = fs.readdirSync(root)
    for (let i in files) {
        await _upload(files[i], rmd5s || {})
    }

    await store.put(path.join(remote_path, '.md5'), Buffer.from(JSON.stringify(md5s, 0, 4))).catch(console.error)
    if (rmd5s) {
        for (let i in rmd5s) {
            if (md5s[i] === undefined) {
                await store.delete(i).catch(console.error)
                console.log('remove file:', i)
            }
        }
    }
    console.log('complate!!')
}

async function _upload(f, remote) {
    const stat = fs.statSync(path.join(root, f))
    if (stat.isDirectory()) {
        const files = fs.readdirSync(path.join(root, f))
        for (let i in files) {
            await _upload(path.join(f, files[i]), remote)
        }
    }

    if (stat.isFile()) {
        const fullpath = path.join(root, f)
        const data = fs.readFileSync(fullpath)
        md5s[f] = crypto.createHash('md5').update(data).digest('hex')
        if (remote[f] !== md5s[f]) {
            let result =
                stat.size > 1024000
                    ? await store.multipartUpload(path.join(remote_path, f), fullpath).catch(console.error)
                    : await store.put(path.join(remote_path, f), fs.createReadStream(fullpath)).catch(console.error)
            if (result) {
                console.log('upload', f, 'success')
            }
        }
    }
}
