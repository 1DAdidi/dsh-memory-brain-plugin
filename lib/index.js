// dsh-memory-brain 宿主插件 v2：
// 1) 直读工作区 .dsh-meow/memory.db（node:sqlite，WAL 并发安全）+ nebula.json 侧车
// 2) 自动扫描 profile 插件生态（绿/黄/红）与技能库（依赖连线）
// 3) 注册同源路由 /memory-brain/*：静态前端 + REST API（DSH GUI 服务器只绑本机）
import { existsSync, readFileSync, statSync, appendFileSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB_ROOT = resolve(HERE, '..', 'web')

const LEVELS = ['soul', 'user', 'project', 'fact', 'lesson', 'topic', 'rules']
const PROJECT_LEVELS = new Set(['project', 'fact', 'lesson', 'topic', 'rules'])
const STATUSES = new Set(['active', 'stale', 'archived'])
const REGIONS = [
  { key: 'cortex',   label: '大脑中枢', sub: '行为准则',   color: '#7d9dff', levels: ['rules'],        immune: true,  kind: 'memory' },
  { key: 'plugins',  label: '插件生态', sub: '印象与状态', color: '#69db7c', levels: [],               immune: false, kind: 'scan' },
  { key: 'skills',   label: '技能库',   sub: '习得技能',   color: '#da77f2', levels: [],               immune: false, kind: 'scan' },
  { key: 'projects', label: '记忆库',   sub: '项目档案',   color: '#ffbe55', levels: ['project'],      immune: false, kind: 'memory' },
  { key: 'hippo',    label: '海马体',   sub: '事实信息',   color: '#b48cff', levels: ['fact'],         immune: true,  kind: 'memory' },
  { key: 'soul',     label: '用户灵魂', sub: '人设与偏好', color: '#ff77a9', levels: ['user', 'soul'], immune: true,  kind: 'memory' },
  { key: 'review',   label: '论衡',     sub: '经验复盘',   color: '#ff9a6c', levels: ['lesson'],       immune: false, kind: 'memory' },
  { key: 'topics',   label: '语言中枢', sub: '话题事件',   color: '#57d8c9', levels: ['topic'],        immune: false, kind: 'memory' },
]
const LEVEL_REGION = {}
for (const r of REGIONS) for (const lv of r.levels) LEVEL_REGION[lv] = r.key
const REGION_IMMUNE = Object.fromEntries(REGIONS.map(r => [r.key, r.immune]))
const HALF_BASE_DAYS = 3

// ── 中文描述映射（保留英文原名，说明自动中文）──
const PLG_ZH = {
  'meow-memory': '跨会话记忆插件（记忆库本体，星图数据源）',
  'dsh-memory-brain': '记忆星脑面板（本视图插件，3D 神经元星图）',
  dshmarket: '插件市场（浏览/安装/更新插件）',
  'dsh-ops': 'OPS 工具集（受限 shell/文件操作执行器）',
  'dsh-ssh': 'SSH 主机远程操作面板',
  'dsh-comfyui': 'ComfyUI 图像/视频/语音生成工作台',
  'dsh-image-gen': '图像生成工具（文生图/图生图）',
  'dsh-meme': '表情包斗图与图库',
  'dsh-voice': '语音输入与识别',
  'dsh-mcp-connector': 'MCP 连接器市场与管理',
  'dsh-univer-office': 'Univer 办公文档（表格/幻灯/文档）',
  'billion-context': '上下文压缩与记忆管理（ACP）',
  'dsh-context': '上下文观察面板',
  'dsh-cost-meter': '费用与 token 统计',
  'dsh-recall-plugin': '会话召回检索',
  'dsh-pet': '桌面宠物',
  'dsh-persona-dafeiyu': '大肥鱼人设插件（读取本面板人设主源）',
  '@changfenhuang/dsh-genui': '结构化 UI 渲染（dsh-ui 围栏）',
  '@nagi-ovo/dsh-visualize': '交互式可视化卡片',
  'lunheng-article-pipeline': '论衡深度长文流水线',
  '@michengai/dsh-skills-manager': '技能管理器',
  '@michengai/dsh-archive-manager': '会话归档管理',
  '@xmanrui/dsh-im': 'IM 消息接入（QQ 等）',
  '@wxg-prc-cpg/dsh-weknora': 'WeKnora 知识库检索',
  '@wxg-prc-cpg/browser-skill-dsh-plugin': '浏览器自动化',
  'dsh-vision-router': '视觉模型路由',
  'dsh-webui-studio': 'WebUI 工作室',
  'dsh-harmony': '和谐模式（模型调度）',
  'dsh-unlag': '卡顿刷新',
  'dsh-config-manager': '配置备份与迁移',
  'dsh-connect-workbuddy': 'WorkBuddy 连接',
  '@xbzbing/dsh-git-panel': 'Git 面板',
  '@yunmiao/studymate': '学习伙伴',
  '@michengai/dsh-pua': 'PUA 激励风格',
  'dsh-my-guardian': '守护哨兵',
  'dsh-our-free-model': '免费模型通道',
  'dsh-better-reasoning-effort': '推理强度调节',
  'cc-safety-net': '危险命令安全网',
  '@anysearch/anysearch-dsh': 'AnySearch 联网检索',
  '@tt-a1i/archify-dsh': '架构图绘制',
  '@nanmicoder/dsh-agent-teams': '多智能体团队',
  '@contexera/dsh-agent-team': 'Agent 团队协作',
  '@goodandready/dsh-voice': '语音输入与识别',
  'dsh-douyin-browser-local': '抖音浏览器自动化',
  '@linxin666/dsh-remote-web-ui': '远程 Web UI',
  '@linxin666/dsh-client-ui-git-graph': 'Git 图形视图',
  '@linxin666/dsh-client-ui-web-ui-settings': 'Web 设置界面',
}
const BUS_PROTECTED = new Set(['meow-memory', 'dsh-memory-brain', 'dshmarket', 'dsh-plugins-manager', 'dsh-ops'])
function zhDesc(name, en) {
  const short = name.split('/').pop()
  if (PLG_ZH[name]) return PLG_ZH[name]
  if (PLG_ZH[short]) return PLG_ZH[short]
  return (en || '').trim() || '（暂无中文说明）'
}

const B36 = '0123456789abcdefghijklmnopqrstuvwxyz'
function b36(n) {
  let s = ''
  while (n > 0) { s = B36[n % 36] + s; n = Math.floor(n / 36) }
  return s.padStart(9, '0')
}
function newId() { return b36(Date.now()) + '-' + randomUUID().replace(/-/g, '').slice(0, 26) }
function parseKeywords(raw) {
  try { const v = JSON.parse(String(raw)); return Array.isArray(v) ? v : [] } catch { return [] }
}
function parseFrontmatter(text) {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---/)
  const out = {}
  if (m) for (const line of m[1].split('\n')) {
    const kv = line.trim().match(/^([A-Za-z_][\w-]*)\s*:\s*(.+)$/)
    if (kv) out[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}

class Nebula {
  constructor(path) { this.path = path }
  read() {
    let data
    try { data = JSON.parse(readFileSync(this.path, 'utf-8')) } catch { data = {} }
    for (const [k, v] of Object.entries({ uninstalls: [], steps: {}, skill_marks: {}, active: [], follows: {}, sync_log: [], conflicts: [], theme: {}, events: [], bus: { version: 0, pushed_at: null } }))
      if (data[k] === void 0) data[k] = JSON.parse(JSON.stringify(v))
    return data
  }
  pushEvent(kind, ref) {
    const data = this.read()
    const ev = data.events || []
    ev.push({ ts: Date.now(), kind, ref: ref || '' })
    data.events = ev.slice(-60)
    this.writeRaw(data)
  }
  drainEvents() {
    const data = this.read()
    const ev = data.events || []
    if (ev.length) this.writeRaw({ ...data, events: [] })
    return ev
  }
  writeRaw(data) {
    writeFileSync(this.path + '.tmp', JSON.stringify(data, null, 1))
    writeFileSync(this.path, readFileSync(this.path + '.tmp', 'utf-8'))
  }
  patch(partial) {
    const data = this.read()
    for (const k of ['uninstalls', 'steps', 'skill_marks', 'active', 'follows', 'conflicts', 'theme']) if (k in partial) data[k] = partial[k]
    writeFileSync(this.path + '.tmp', JSON.stringify(data, null, 1))
    try { appendFileSync(join(HERE, '..', 'boot.log'), `[${new Date().toISOString()}] nebula write\n`) } catch { /* noop */ }
    writeFileSync(this.path, readFileSync(this.path + '.tmp', 'utf-8'))
    return data
  }
}

class Store {
  constructor(dbpath, profileDir) {
    this.dbpath = dbpath
    this.profileDir = profileDir
    this.nebula = new Nebula(join(dirname(dbpath), 'nebula.json'))
    this.con = new DatabaseSync(dbpath)
    this.con.exec('PRAGMA journal_mode = WAL')
    this.con.exec('PRAGMA busy_timeout = 4000')
    const names = new Set(this.con.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name))
    this.tables = LEVELS.filter(lv => names.has(lv))
  }
  static decay(d, tnow, immune) {
    if (immune) return [1, 0]
    const ref = Math.max(d.created_at ?? 0, d.updated_at ?? 0, d.last_accessed_at ?? 0)
    const imp = Math.min(Math.max(d.importance ?? 1, 1), 4)
    const half = HALF_BASE_DAYS * 2 ** (imp - 1)
    const ageDays = ref ? Math.max(0, (tnow - ref) / 86400000) : 0
    let strength = 0.5 ** (ageDays / half)
    const hc = d.hit_count ?? 0
    if (hc > 0) strength = Math.min(1, strength * (1 + 0.05 * Math.min(hc, 20)))
    strength = Math.round(strength * 1e4) / 1e4
    return [strength, Math.round((1 - strength) * 1e4) / 1e4]
  }
  toNode(lv, r, tnow, neb) {
    const region = LEVEL_REGION[lv] ?? 'topics'
    const [strength, decay] = Store.decay(r, tnow, REGION_IMMUNE[region])
    const title = r.title ?? ''
    return {
      id: r.id, kind: 'memory', level: lv, region,
      title, content: r.content ?? '', keywords: parseKeywords(r.keywords),
      importance: r.importance ?? 1, status: r.status ?? 'active', project: r.project ?? '',
      subcategory: r.subcategory ?? '', goal: r.goal ?? '', corrected: !!r.corrected,
      hit_count: r.hit_count ?? 0, created_at: r.created_at ?? 0, updated_at: r.updated_at ?? 0,
      last_accessed_at: r.last_accessed_at ?? null, source_session: r.source_session ?? '',
      strength, decay, immune: REGION_IMMUNE[region],
      active: (neb.active || []).includes(r.id),
      label: title || (r.content ?? '').slice(0, 12),
    }
  }
  scanPlugins(memories, neb) {
    const out = []
    let deps = {}, bundles = []
    try {
      const pm = JSON.parse(readFileSync(join(this.profileDir, 'package.json'), 'utf-8'))
      deps = pm.dependencies || {}
      bundles = (pm.dsh && pm.dsh.profile && pm.dsh.profile.bundles) || []
    } catch { /* noop */ }
    const bundleSet = new Set(bundles)
    const nm = join(this.profileDir, 'node_modules')
    const installed = {}
    for (const name of Object.keys(deps)) {
      const pj = join(nm, name, 'package.json')
      if (!existsSync(pj)) continue
      try {
        const m = JSON.parse(readFileSync(pj, 'utf-8'))
        if ((m.dsh && m.dsh.bundle) || /dsh|memory/i.test(name))
          installed[name] = { version: m.version || '?', desc: (m.description || '').slice(0, 160), hasPatch: Boolean(m.dsh && m.dsh.bundle && m.dsh.bundle.patch) }
      } catch { /* noop */ }
    }
    const pool = memories.map(m => [m.project + ' ' + m.keywords.join(' ') + ' ' + m.content + ' ' + m.title, m])
    const uninstalls = Object.fromEntries((neb.uninstalls || []).map(u => [u.name, u]))
    const follows = neb.follows || {}
    for (const [name, info] of Object.entries(installed)) {
      if (uninstalls[name]) continue
      const short = name.split('/').pop()
      let cnt = 0, hits = 0
      for (const [t, m] of pool) if (t.includes(short)) { cnt++; hits += m.hit_count }
      const status = cnt > 0 ? 'green' : 'yellow'
      const enabled = bundleSet.has(name)
      const busClass = info.hasPatch ? 'A' : 'B'
      out.push({
        id: 'plugin:' + name, kind: 'plugin', region: 'plugins', label: short, title: name,
        content: zhDesc(name, info.desc), desc_en: info.desc,
        pstat: enabled ? status : 'yellow', version: info.version, calls: hits, refs: cnt,
        enabled, protected: BUS_PROTECTED.has(short) || BUS_PROTECTED.has(name),
        bus: busClass, follow: name in follows ? follows[name] : busClass === 'A',
        strength: (status === 'green' ? 1 : 0.85) * (enabled ? 1 : 0.7),
        decay: status === 'green' && enabled ? 0 : enabled ? 0.15 : 0.4,
        immune: status === 'green' && enabled, active: false, status: enabled ? 'active' : 'stale',
        keywords: [name], importance: 2, project: '', level: 'plugin', hit_count: hits,
        created_at: 0, updated_at: 0, last_accessed_at: null,
        source_session: 'scan', goal: '', subcategory: '', corrected: false,
      })
    }
    for (const [name, u] of Object.entries(uninstalls)) {
      out.push({
        id: 'plugin:' + name, kind: 'plugin', region: 'plugins', label: name.split('/').pop(), title: name,
        content: `卸载时间：${u.removed_at || '-'}｜原因：${u.reason || '-'}｜已知缺陷：${u.defects || '-'}`,
        desc_en: u.desc_en || '',
        pstat: 'red', version: u.version || '?', calls: 0, refs: 0,
        enabled: false, protected: false, bus: 'B', follow: false,
        strength: 0.45, decay: 0.55, immune: false, active: false, status: 'archived', keywords: [name], importance: 1,
        project: '', level: 'plugin', hit_count: 0, created_at: 0, updated_at: 0, last_accessed_at: null,
        source_session: 'manual', goal: '', subcategory: '', corrected: false,
      })
    }
    return out
  }
  scanSkills(pluginNodes, neb) {
    const skills = []
    const pluginShort = new Set(pluginNodes.map(p => p.title.split('/').pop()))
    const roots = []
    const nm = join(this.profileDir, 'node_modules')
    const skillDirs = dir => { try { return readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => join(dir, d.name)) } catch { return [] } }
    for (const pkg of [...skillDirs(nm), ...skillDirs(nm).filter(d => d.includes('@')).flatMap(sc => skillDirs(sc))])
      roots.push(...skillDirs(join(pkg, 'skills')))
    roots.push(...skillDirs(join(this.workspace || dirname(dirname(this.dbpath)), '.dsh', 'skills')))
    const marks = neb.skill_marks || {}
    const seen = new Set()
    for (const r of roots) {
      const sk = join(r, 'SKILL.md')
      if (!existsSync(sk)) continue
      let text
      try { text = readFileSync(sk, 'utf-8').slice(0, 8000) } catch { continue }
      const fm = parseFrontmatter(text)
      const name = fm.name || r.split(/[\\/]/).pop()
      const key = 'skill:' + name
      if (seen.has(key)) continue
      seen.add(key)
      const desc = (fm.description || text.split('---').pop().replace(/\s+/g, ' ').slice(0, 120)).trim()
      const descZh = /[\u4e00-\u9fff]/.test(desc) ? desc : (desc ? '（暂无中文说明，原描述：' + desc.slice(0, 80) + '）' : '（暂无中文说明）')
      const depsHit = [...pluginShort].filter(p => text.includes(p)).sort()
      const status = (marks[name] || {}).status || (text.length > 1500 ? 'mastered' : 'learning')
      skills.push({
        id: key, kind: 'skill', region: 'skills', label: name, title: name, content: descZh.slice(0, 240), desc_en: desc.slice(0, 240),
        sstat: status, deps: depsHit,
        strength: { mastered: 1, learning: 0.8, optimize: 0.6 }[status],
        decay: { mastered: 0, learning: 0.2, optimize: 0.4 }[status],
        immune: status === 'mastered', active: false, status: 'active', keywords: [name], importance: 2,
        project: '', level: 'skill', hit_count: 0, created_at: 0, updated_at: 0, last_accessed_at: null,
        source_session: 'scan', goal: '', subcategory: '', corrected: false,
        path: sk.replaceAll('\\', '/'),
      })
    }
    return skills
  }
  allNodes() {
    const tnow = Date.now()
    const neb = this.nebula.read()
    const memories = []
    for (const lv of this.tables)
      for (const r of this.con.prepare(`SELECT * FROM ${lv}`).all()) memories.push(this.toNode(lv, r, tnow, neb))
    memories.sort((a, b) => (b.updated_at || b.created_at) - (a.updated_at || a.created_at))
    const plugins = this.scanPlugins(memories, neb)
    const skills = this.scanSkills(plugins, neb)
    const nodes = [...memories, ...plugins, ...skills]
    const links = nodes.map(n => ({ a: n.id, b: '@' + n.region, type: 'belong' }))
    const stepsMap = neb.steps || {}
    for (const m of memories) {
      if (m.level !== 'project') continue
      for (const [i, st] of (stepsMap[m.id] || stepsMap[m.title] || []).entries()) {
        const sid = `step:${m.id}:${i}`
        const state = st.state || 'todo'
        nodes.push({
          id: sid, kind: 'step', region: 'projects', label: (st.text || '').slice(0, 14), title: st.text || '',
          content: `状态：${state}`, sstate: state, strength: state === 'done' ? 1 : 0.8, decay: 0, immune: false,
          active: false, status: 'active', keywords: [], importance: 1, project: m.project, level: 'step',
          hit_count: 0, created_at: 0, updated_at: 0, last_accessed_at: null, source_session: 'nebula',
          goal: '', subcategory: '', corrected: false,
        })
        links.push({ a: m.id, b: sid, type: 'step' })
      }
    }
    const pluginIds = new Set(plugins.map(p => p.id))
    for (const s of skills) {
      for (const p of s.deps) {
        const pid = 'plugin:' + p
        if (pluginIds.has(pid)) links.push({ a: s.id, b: pid, type: 'depend' })
        else { links.push({ a: s.id, b: '@plugins', type: 'depend-missing' }); (s.missing_deps = s.missing_deps || []).push(p) }
      }
    }
    const byProj = {}
    for (const m of memories)
      if (m.status !== 'archived' && m.project && m.project !== '全局') (byProj[m.project] = byProj[m.project] || []).push(m.id)
    for (const ids of Object.values(byProj))
      for (let i = 1; i < ids.length; i++) links.push({ a: ids[0], b: ids[i], type: 'proj' })
    return { regions: REGIONS, nodes, links, halfLifeBaseDays: HALF_BASE_DAYS }
  }
  find(memId) {
    if (!memId) return null
    const matches = []
    const neb = this.nebula.read()
    for (const lv of this.tables)
      for (const r of this.con.prepare(`SELECT * FROM ${lv} WHERE id = ? OR id LIKE ?`).all(memId, memId + '%'))
        matches.push([lv, this.toNode(lv, r, Date.now(), neb)])
    if (!matches.length) return null
    if (matches.length > 1) throw new Error(`id 前缀「${memId}」命中 ${matches.length} 条，请改用完整 id`)
    return matches[0]
  }
  search(q, level, status, region, limit) {
    limit = Math.max(1, Math.min(Number(limit) || 200, 800))
    const g = this.allNodes()
    const wantLevels = level ? new Set(level.split(',').map(s => s.trim())) : null
    const wantRegions = region ? new Set(region.split(',').map(s => s.trim())) : null
    const like = q.toLowerCase()
    let out = g.nodes.filter(n => {
      const key = n.kind === 'memory' ? n.level : n.kind
      if (wantLevels && !wantLevels.has(key)) return false
      if (wantRegions && !wantRegions.has(n.region)) return false
      if (status && n.status !== status) return false
      if (q && !((n.title + ' ' + n.content + ' ' + n.keywords.join(' ') + ' ' + (n.project || '')).toLowerCase().includes(like))) return false
      return true
    })
    out.sort((a, b) => (b.updated_at || b.created_at) - (a.updated_at || a.created_at))
    return { items: out.slice(0, limit), total: out.length }
  }
  insert(data) {
    const lv = data.level
    if (!this.tables.includes(lv)) throw new Error(`level 必须是 ${this.tables.join('/')}`)
    const content = String(data.content ?? '').trim()
    if (!content) throw new Error('content 不能为空')
    const kw = (Array.isArray(data.keywords) ? data.keywords : []).map(String).map(s => s.trim()).filter(Boolean).slice(0, 20)
    const t = Date.now(), mid = newId()
    const cols = ['id', 'title', 'content', 'importance', 'keywords', 'status', 'source_session', 'hit_count', 'created_at', 'updated_at', 'last_accessed_at']
    const vals = [mid, String(data.title ?? '').trim().slice(0, 120), content,
      Math.max(0, Math.min(Number(data.importance) || 1, 9)), JSON.stringify(kw), 'active',
      'web-brain-panel', 0, t, t, null]
    if (lv === 'project') { cols.push('subcategory'); vals.push(String(data.subcategory ?? '') || null) }
    if (lv === 'lesson') { cols.push('corrected'); vals.push(data.corrected ? 1 : 0) }
    if (lv === 'topic') { cols.push('goal'); vals.push(String(data.goal ?? '').trim() || null) }
    if (PROJECT_LEVELS.has(lv)) { cols.push('project'); vals.push(String(data.project ?? '').trim() || null) }
    this.con.prepare(`INSERT INTO ${lv} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals)
    this.nebula.pushEvent('write', mid)
    return { level: lv, id: mid }
  }
  update(memId, patch) {
    const found = this.find(memId)
    if (!found) return false
    const [lv, cur] = found
    const allow = ['title', 'content', 'importance', 'status', 'keywords', 'project', 'subcategory', 'goal', 'corrected']
    const real = {}
    for (const k of allow) if (k in patch) real[k] = patch[k]
    if ('keywords' in real) {
      const kw = (Array.isArray(real.keywords) ? real.keywords : []).map(String).map(s => s.trim()).filter(Boolean).slice(0, 20)
      if (!kw.length) delete real.keywords; else real.keywords = JSON.stringify(kw)
    }
    if ('content' in real && !String(real.content).trim()) delete real.content
    if ('title' in real) real.title = String(real.title).trim().slice(0, 120)
    if ('status' in real && !STATUSES.has(real.status)) delete real.status
    if ('importance' in real) real.importance = Math.max(0, Math.min(Number(real.importance) || 1, 9))
    if ('corrected' in real) real.corrected = real.corrected ? 1 : 0
    if ('goal' in real && lv !== 'topic') delete real.goal
    if ('subcategory' in real && lv !== 'project') delete real.subcategory
    if (Object.keys(real).length) {
      real.updated_at = Date.now()
      const keys = Object.keys(real)
      this.con.prepare(`UPDATE ${lv} SET ${keys.map(k => k + ' = ?').join(', ')} WHERE id = ?`).run(...keys.map(k => real[k]), cur.id)
      this.nebula.pushEvent('write', cur.id)
    }
    return true
  }
  delete(memId) {
    const found = this.find(memId)
    if (!found) return false
    this.con.prepare(`DELETE FROM ${found[0]} WHERE id = ?`).run(found[1].id)
    const neb = this.nebula.read()
    if (neb.steps && neb.steps[found[1].id]) this.nebula.patch({ steps: Object.fromEntries(Object.entries(neb.steps).filter(([k]) => k !== found[1].id)) })
    return true
  }
  touch(memId) {
    const found = this.find(memId)
    if (!found) return false
    this.con.prepare(`UPDATE ${found[0]} SET hit_count = hit_count + 1, last_accessed_at = ? WHERE id = ?`)
      .run(Date.now(), found[1].id)
    this.nebula.pushEvent('recall', found[1].id)
    return true
  }
  isEmpty() {
    for (const lv of this.tables) if (this.con.prepare(`SELECT 1 FROM ${lv} LIMIT 1`).get()) return false
    return true
  }
  // ═══ 全局配置总线 ═══
  busSnapshot() {
    const tnow = Date.now()
    const neb = this.nebula.read()
    const cortex = [], soul = []
    for (const r of this.con.prepare('SELECT * FROM rules').all()) cortex.push(this.toNode('rules', r, tnow, neb))
    for (const lv of ['user', 'soul']) if (this.tables.includes(lv))
      for (const r of this.con.prepare(`SELECT * FROM ${lv}`).all()) soul.push(this.toNode(lv, r, tnow, neb))
    return { cortex, soul, version: (neb.bus || {}).version || 0 }
  }
  allMemories() {
    const tnow = Date.now(), neb = this.nebula.read(), out = []
    for (const lv of this.tables) for (const r of this.con.prepare(`SELECT * FROM ${lv}`).all()) out.push(this.toNode(lv, r, tnow, neb))
    return out
  }
  busPush(note) {
    const neb = this.nebula.read()
    const bus = neb.bus || { version: 0 }
    bus.version = (bus.version || 0) + 1
    bus.pushed_at = Date.now()
    neb.bus = bus
    const plugins = this.scanPlugins(this.allMemories(), neb)
    const log = neb.sync_log || []
    for (const p of plugins) if (p.bus === 'A' && p.follow)
      log.push({ ts: Date.now(), plugin: p.title, event: '总线推送 v' + bus.version, ok: true, note: note || '主源变更自动分发' })
    neb.sync_log = log.slice(-200)
    this.nebula.write(neb)
    return { version: bus.version, pushed_at: bus.pushed_at, targets: plugins.filter(p => p.bus === 'A' && p.follow).map(p => p.title) }
  }
  busResolve(plugin, choice) {
    const neb = this.nebula.read()
    const follows = neb.follows || {}
    if (choice === 'separate') follows[plugin] = false
    else if (choice === 'override' || choice === 'merge') follows[plugin] = true
    else throw new Error('choice 必须是 override/separate/merge')
    neb.follows = follows
    const log = neb.sync_log || []
    log.push({ ts: Date.now(), plugin, event: '冲突裁决:' + choice, ok: true, note: choice !== 'separate' ? '星图主源为准' : '该插件独立配置不再同步' })
    neb.sync_log = log.slice(-200)
    this.nebula.write(neb)
    return { ok: true, follow: follows[plugin] }
  }
  // ═══ 插件操作（三层装配直改，重启生效）═══
  pluginAction(name, action) {
    const short = name.split('/').pop()
    if (BUS_PROTECTED.has(short) && (action === 'uninstall' || action === 'remove'))
      throw new Error(`${short} 在保护黑名单内：仅可在 DSH 原生设置页卸载，避免面板自毁`)
    const pmPath = join(this.profileDir, 'package.json')
    const pm = JSON.parse(readFileSync(pmPath, 'utf-8'))
    const deps = pm.dependencies || {}
    const bundles = ((pm.dsh = pm.dsh || {}).profile = (pm.dsh.profile || {})).bundles = ((pm.dsh.profile.bundles) || [])
    if (action !== 'reinstall' && !(name in deps)) throw new Error(`依赖表里没有 ${name}（可能已卸载）`)
    const neb = this.nebula.read()
    const log = neb.sync_log || []
    const ts = Date.now()
    if (action === 'disable') {
      const i = bundles.indexOf(name); if (i >= 0) bundles.splice(i, 1)
      log.push({ ts, plugin: name, event: '禁用（移出 bundles）', ok: true, note: '重启 DSH 生效' })
    } else if (action === 'enable') {
      if (!bundles.includes(name)) bundles.push(name)
      log.push({ ts, plugin: name, event: '启用（加入 bundles）', ok: true, note: '重启 DSH 生效' })
    } else if (action === 'uninstall' || action === 'remove') {
      const ver = deps[name] || '?'
      const i = bundles.indexOf(name); if (i >= 0) bundles.splice(i, 1)
      neb.uninstalls = (neb.uninstalls || []).filter(u => u.name !== name)
      neb.uninstalls.push({ name, version: ver, removed_at: new Date(ts).toLocaleString('zh-CN'), reason: '星图面板卸载', defects: '-' })
      log.push({ ts, plugin: name, event: '卸载登记（deps+bundles 移除，包体保留待清理）', ok: true, note: '重启 DSH 生效；如需恢复用重装' })
    } else if (action === 'reinstall') {
      neb.uninstalls = (neb.uninstalls || []).filter(u => u.name !== name)
      if (!bundles.includes(name)) bundles.push(name)
      log.push({ ts, plugin: name, event: '重装（撤销卸载登记并启用）', ok: true, note: '依赖声明仍在则重启即恢复；若 deps 已被清需从市场重新安装' })
    } else throw new Error('action 必须是 enable/disable/uninstall/reinstall')
    writeFileSync(pmPath + '.tmp', JSON.stringify(pm, null, 2))
    writeFileSync(pmPath, readFileSync(pmPath + '.tmp', 'utf-8'))
    neb.sync_log = log.slice(-200)
    this.nebula.write(neb)
    return { ok: true, action, plugin: name, note: '已写入装配表，重启 DSH 后生效' }
  }
  stats() {
    const g = this.allNodes()
    const byRegion = {}, byStatus = {}
    for (const n of g.nodes) {
      byRegion[n.region] = (byRegion[n.region] || 0) + 1
      byStatus[n.status] = (byStatus[n.status] || 0) + 1
    }
    const mem = g.nodes.filter(n => n.kind === 'memory')
    const plugins = g.nodes.filter(n => n.kind === 'plugin')
    const skills = g.nodes.filter(n => n.kind === 'skill')
    const steps = g.nodes.filter(n => n.kind === 'step')
    let sum = 0, faded = 0
    const proj = {}, kw = {}, recent = {}
    for (const n of mem) {
      sum += n.strength
      if (n.status === 'active' && n.decay > 0.7) faded++
      for (const p of String(n.project || '').split(',')) { const t = p.trim(); if (t && t !== '全局') proj[t] = (proj[t] || 0) + 1 }
      for (const k of n.keywords.slice(0, 13)) kw[String(k)] = (kw[String(k)] || 0) + 1
      const day = new Date(n.updated_at || n.created_at).toLocaleDateString('sv')
      recent[day] = (recent[day] || 0) + 1
    }
    const activity = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toLocaleDateString('sv')
      activity.push({ day: d, count: recent[d] || 0 })
    }
    const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n)
    return {
      total: g.nodes.length, memories: mem.length, plugins: plugins.length, skills: skills.length, steps: steps.length,
      by_region: byRegion, by_status: byStatus,
      plugin_states: { green: plugins.filter(p => p.pstat === 'green').length, yellow: plugins.filter(p => p.pstat === 'yellow').length, red: plugins.filter(p => p.pstat === 'red').length },
      skill_states: { mastered: skills.filter(s => s.sstat === 'mastered').length, learning: skills.filter(s => s.sstat === 'learning').length, optimize: skills.filter(s => s.sstat === 'optimize').length },
      avg_strength: mem.length ? Math.round(sum / mem.length * 1e4) / 1e4 : 0,
      faded_active: faded,
      top_projects: top(proj, 10), top_keywords: top(kw, 14), activity,
      db_path: this.dbpath.replaceAll('\\', '/'),
    }
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
}
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-length': Buffer.byteLength(body) })
  res.end(body)
}
function originOk(req) {
  const o = req.headers?.origin || req.headers?.referer || ''
  if (!o) return true
  try { const h = new URL(o).hostname.toLowerCase(); return h === 'localhost' || h.startsWith('127.') || h === '::1' } catch { return false }
}

function makeHandler(getStore, log) {
  return (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const p = url.pathname.replace(/^\/memory-brain/, '') || '/'
    try {
      if (p.startsWith('/api/')) {
        const store = getStore()
        if (!store) return sendJson(res, 503, { ok: false, error: '未找到记忆库（.dsh-meow/memory.db）' })
        const q = Object.fromEntries(url.searchParams)
        if (req.method === 'GET') {
          if (p === '/api/health') return sendJson(res, 200, { ok: true, db: store.dbpath.replaceAll('\\', '/'), empty: store.isEmpty(), tables: store.tables, v: 2 })
          if (p === '/api/graph') return sendJson(res, 200, store.allNodes())
          if (p === '/api/memories') return sendJson(res, 200, store.search(q.q || '', q.level || '', q.status || '', q.region || '', q.limit))
          if (p === '/api/memory') { try { const f = store.find(q.id || ''); return f ? sendJson(res, 200, f[1]) : sendJson(res, 404, { ok: false, error: 'not found' }) } catch (e) { return sendJson(res, 400, { ok: false, error: String(e.message || e) }) } }
          if (p === '/api/stats') return sendJson(res, 200, store.stats())
          if (p === '/api/events') return sendJson(res, 200, { ok: true, events: store.nebula.drainEvents() })
          if (p === '/api/nebula') return sendJson(res, 200, store.nebula.read())
          if (p === '/api/bus') {
            const neb = store.nebula.read(), snap = store.busSnapshot()
            return sendJson(res, 200, { snapshot: snap, follows: neb.follows || {}, sync_log: (neb.sync_log || []).slice(-40), conflicts: neb.conflicts || [] })
          }
          if (p === '/api/wallpaper-frame') {
            // 壁纸三级源：①引擎 GPU 帧（优先 id，路径由配置/nebula 传入，无配置则跳过引擎源）②Windows 系统桌面壁纸 ③404（前端降级星空）
            const engineCfg = (store.nebula.read().theme?.wallpaper_engine_frames_dir || '').trim()
            const FR = engineCfg || ''
            try {
              const files = existsSync(FR) ? readdirSync(FR).filter(f => f.endsWith('_gpu.png')) : []
              const dec = fn => { try { return Buffer.from(fn.split('_')[1], 'base64').toString('utf-8') } catch { return '' } }
              const want = String(q.id || '').trim()
              let chosen = want ? files.find(f => dec(f).includes(want)) : null
              if (!chosen && files.length) chosen = files.map(f => [f, statSync(join(FR, f)).mtimeMs]).sort((a, b) => b[1] - a[1])[0][0]
              if (chosen) {
                const body = readFileSync(join(FR, chosen))
                res.writeHead(200, { 'content-type': 'image/png', 'x-wallpaper-source': 'engine', 'content-length': body.length, 'cache-control': 'max-age=15' })
                return res.end(body)
              }
              try {
                const out = execFileSync('reg', ['query', 'HKCU\\Control Panel\\Desktop', '/v', 'WallPaper'], { timeout: 5000 }).toString('latin1')
                const m = out.match(/WallPaper\s+REG_SZ\s+(.+)/)
                const wp = m && m[1].trim()
                if (wp && existsSync(wp)) {
                  const ext = wp.slice(wp.lastIndexOf('.')).toLowerCase()
                  const ct = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.bmp': 'image/bmp', '.webp': 'image/webp' }[ext] || 'application/octet-stream'
                  const body = readFileSync(wp)
                  res.writeHead(200, { 'content-type': ct, 'x-wallpaper-source': 'system', 'content-length': body.length, 'cache-control': 'max-age=60' })
                  return res.end(body)
                }
              } catch { /* 继续 404 */ }
              res.writeHead(404); return res.end()
            } catch { res.writeHead(404); return res.end() }
          }
          if (p === '/api/ext-url') {
            const host = req.headers?.host || '127.0.0.1:8643'
            return sendJson(res, 200, { ok: true, origin: 'http://' + host })
          }
          return sendJson(res, 404, { ok: false, error: 'unknown api' })
        }
        if (req.method === 'POST' || req.method === 'PUT') {
          if (!originOk(req)) return sendJson(res, 403, { ok: false, error: 'forbidden origin' })
          let size = 0; const chunks = []
          req.on('data', c => { size += c.length; if (size > 2 * 1024 * 1024) { req.destroy(); return } chunks.push(c) })
          req.on('end', () => {
            let data
            try { data = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}') } catch { return sendJson(res, 400, { ok: false, error: 'bad json' }) }
            try {
              if (p === '/api/memory') { const r = store.insert(data); return sendJson(res, 200, { ok: true, ...r }) }
              if (p === '/api/memory/update') { const ok = store.update(String(data.id || ''), data); return sendJson(res, ok ? 200 : 404, { ok, error: ok ? null : '未找到该记忆' }) }
              if (p === '/api/memory/delete') { const ok = store.delete(String(data.id || '')); return sendJson(res, ok ? 200 : 404, { ok, error: ok ? null : '未找到该记忆' }) }
              if (p === '/api/memory/touch') return sendJson(res, 200, { ok: store.touch(String(data.id || '')) })
              if (p === '/api/nebula') return sendJson(res, 200, { ok: true, data: store.nebula.patch(data) })
              if (p === '/api/bus/push') { const r = store.busPush(String(data.note || '')); return sendJson(res, 200, { ok: true, ...r }) }
              if (p === '/api/bus/resolve') return sendJson(res, 200, store.busResolve(String(data.plugin || ''), String(data.choice || '')))
              if (p === '/api/plugin/action') return sendJson(res, 200, store.pluginAction(String(data.name || ''), String(data.action || '')))
              return sendJson(res, 404, { ok: false, error: 'unknown api' })
            } catch (e) { return sendJson(res, 400, { ok: false, error: String(e.message || e) }) }
          })
          return
        }
        return sendJson(res, 405, { ok: false, error: 'method not allowed' })
      }
      const rel = p === '/' ? '/index.html' : p
      const fp = resolve(WEB_ROOT, '.' + sep + rel.replace(/^\/+/, '').replaceAll('/', sep))
      if (!fp.startsWith(WEB_ROOT + sep) && fp !== WEB_ROOT) { res.writeHead(403); return res.end('forbidden') }
      if (!existsSync(fp) || !statSync(fp).isFile()) { res.writeHead(404); return res.end('not found') }
      const body = readFileSync(fp)
      res.writeHead(200, { 'content-type': MIME[fp.slice(fp.lastIndexOf('.'))] || 'application/octet-stream', 'content-length': body.length, 'cache-control': 'no-cache' })
      res.end(body)
    } catch (e) {
      log?.('error', `memory-brain route error: ${e?.stack || e}`)
      try { sendJson(res, 500, { ok: false, error: String(e?.message || e) }) } catch { /* 已断线 */ }
    }
  }
}

// 默认工作区/插件目录留空，由插件 config 或运行目录 process.cwd() 自动探测，不写死本机路径
const DEFAULT_WORKSPACE = ''
const DEFAULT_PROFILE = ''

export const name = 'dsh-memory-brain'
export const inject = ['webServer']

export function apply(ctx, config = {}) {
  const log = (level, msg) => { try { ctx.logger?.[level]?.(msg) } catch { /* noop */ } }
  try {
    mkdirSync(HERE, { recursive: true })
    appendFileSync(join(HERE, '..', 'boot.log'), `[${new Date().toISOString()}] apply() entered v2\n`)
  } catch { /* noop */ }
  let store = null, storeKey = ''
  const wsCandidates = []
  if (config?.workspace) wsCandidates.push(config.workspace)
  if (DEFAULT_WORKSPACE) wsCandidates.push(DEFAULT_WORKSPACE)
  try { wsCandidates.push(process.cwd()) } catch { /* noop */ }
  const profileDir = config?.profile || DEFAULT_PROFILE
  const getStore = () => {
    for (const ws of wsCandidates) {
      const db = join(ws, '.dsh-meow', 'memory.db')
      if (existsSync(db)) {
        if (!store || storeKey !== db) {
          try { store = new Store(db, profileDir); store.workspace = ws; storeKey = db }
          catch (e) { log('error', `memory-brain open db failed: ${e?.message || e}`); return null }
        }
        return store
      }
    }
    return null
  }
  const handler = makeHandler(getStore, log)
  let registered = false, attempts = 0
  const tryRegister = () => {
    if (registered) return
    attempts++
    let ws
    try { ws = ctx.get?.('webServer') ?? ctx.webServer } catch { ws = undefined }
    if (ws && typeof ws.register === 'function') {
      try {
        const dispose = ws.register({ kind: 'prefix', path: '/memory-brain', handler })
        registered = true
        log('info', 'dsh-memory-brain v2: /memory-brain/* routes registered (attempt ' + attempts + ')')
        try { appendFileSync(join(HERE, '..', 'boot.log'), `[${new Date().toISOString()}] routes registered attempt=${attempts}\n`) } catch { /* noop */ }
        if (typeof dispose === 'function') ctx.effect?.(() => dispose)
      } catch (e) {
        log('error', `dsh-memory-brain: route registration failed: ${e?.message || e}`)
      }
    }
    if (!registered && attempts < 20) setTimeout(tryRegister, 1000)
    else if (!registered) log('warn', 'dsh-memory-brain: webServer 20s 内未就绪，路由未注册')
  }
  tryRegister()
}
