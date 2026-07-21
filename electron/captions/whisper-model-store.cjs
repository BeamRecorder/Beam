const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const MODELS = ['Xenova/whisper-tiny', 'Xenova/whisper-tiny.en', 'Xenova/whisper-base', 'Xenova/whisper-base.en', 'Xenova/whisper-small', 'Xenova/whisper-small.en', 'Xenova/whisper-medium', 'Xenova/whisper-medium.en', 'Xenova/whisper-large-v3']
const ARTIFACTS = ['config.json', 'generation_config.json', 'preprocessor_config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'onnx/model_quantized.onnx']
const validModel = (id) => MODELS.includes(id)
const safeTarget = (root, relative) => { const target = path.resolve(root, relative); return target.startsWith(`${path.resolve(root)}${path.sep}`) ? target : null }

function createWhisperModelStore(root, fetchImpl = fetch) {
  const state = (id) => {
    if (!validModel(id)) throw new Error('Modèle Whisper invalide.')
    const directory = path.join(root, id)
    const files = ARTIFACTS.map((file) => path.join(directory, file)); const available = files.filter(fs.existsSync)
    const totalBytes = available.reduce((total, file) => total + fs.statSync(file).size, 0)
    return { id, status: available.length === ARTIFACTS.length ? 'ready' : 'missing', downloadedBytes: totalBytes, totalBytes: totalBytes || null }
  }
  const download = async (id, notify = () => {}) => {
    if (!validModel(id)) throw new Error('Modèle Whisper invalide.')
    const directory = path.join(root, id); fs.mkdirSync(directory, { recursive: true }); let downloadedBytes = 0; let totalBytes = 0
    for (const artifact of ARTIFACTS) {
      const target = safeTarget(directory, artifact); if (!target) throw new Error('Chemin de modèle invalide.')
      if (fs.existsSync(target)) { downloadedBytes += fs.statSync(target).size; continue }
      const response = await fetchImpl(`https://huggingface.co/${id}/resolve/main/${artifact}`)
      if (!response.ok || !response.body) throw new Error(`Téléchargement Whisper impossible : ${artifact}`)
      const expected = Number(response.headers.get('content-length')) || 0; totalBytes += expected; fs.mkdirSync(path.dirname(target), { recursive: true })
      const temporary = `${target}.partial`; const hash = crypto.createHash('sha256'); const output = fs.createWriteStream(temporary)
      await new Promise((resolve, reject) => { response.body.on('data', (chunk) => { downloadedBytes += chunk.length; hash.update(chunk); notify({ id, status: 'downloading', downloadedBytes, totalBytes: totalBytes || null, artifact }) }); response.body.on('error', reject); output.on('error', reject); output.on('finish', resolve); response.body.pipe(output) })
      fs.renameSync(temporary, target); notify({ id, status: 'downloading', downloadedBytes, totalBytes: totalBytes || null, artifact, sha256: hash.digest('hex') })
    }
    return state(id)
  }
  const fileForUrl = (url) => { const parsed = new URL(url); if (parsed.protocol !== 'whisper-model:' || parsed.hostname !== 'models') return null; const target = safeTarget(root, decodeURIComponent(parsed.pathname).replace(/^\//, '')); return target && fs.existsSync(target) ? target : null }
  return { state, download, fileForUrl, models: MODELS }
}
module.exports = { createWhisperModelStore }
