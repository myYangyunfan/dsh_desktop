'use strict';

// ---------------------------------------------------------------------------
// 补丁适配器（唯一 transform 收口）。
//
// 所有运行时补丁的「变换」纯函数都从这里取用：
//   - runtime-patches.js 的 9 个 transform 原样 re-export（变换实现仍留在该
//     模块，锚点常量/注入代码字节级不变）；
//   - 原 main.js 内联的 6 个 transform（image-send / vision-key /
//     profile-patch-guard / settings-section-guard / workspace-search-rail /
//     plugin-inventory-tab-merge）在此声明化，字节级输出与旧实现一致；
//   - profile-bundle-guard 的两个 transform（app-boot / profile-boot）委托
//     profile-bundle-heal.js 的唯一实现；
//   - 包级补丁（web-search / menu-viewport / session-manage /
//     open-project-dir / session-persistence）以「node_modules 根应用器」形态
//     收口，patch-runner 直接调用，不复制其锚点逻辑。
//
// 本模块不读写文件（除 rootAppliers 委托的 patch-*.js 外），纯声明。
// ---------------------------------------------------------------------------

const {
  transformFlashFix,
  transformPersistenceAll,
  transformLegacySlotKey,
  transformSlotUnkeyedCompat,
  transformSlotErrorIsolation,
  transformShellDescriptionOptional,
  transformAttachmentMimeTrust,
  SLOT_KEY_COMPAT_MARKER,
  SLOT_UNKEYED_COMPAT_MARKER,
  SLOT_ERROR_ISOLATE_MARKER,
  SLOT_ERROR_ISOLATE_MARKER_V2,
} = require('./runtime-patches');

const {
  PROFILE_BUNDLE_GUARD_MARKER,
  PROFILE_BOOT_GUARD_MARKER,
  applyAppBootBundleGuard,
  applyProfileBootHealGuard,
  applyProfileBootBundleGuard,
} = require('../../profile-bundle-heal');

// 包级补丁（node_modules 根应用器，唯一实现；签名 (nmRoot, log) => number）。
const { patchWebSearchBaseUrl } = require('../patch-web-search-baseurl');
const { patchMenuViewport } = require('../patch-menu-viewport');
const { patchOpenProjectDir } = require('../patch-open-project-dir');
const { patchSessionPersistence } = require('../patch-session-persistence');
// 对话删除 / 归档管理补丁（删除 + 恢复归档 + 设置内归档管理链路；孤儿进程
// 清理已内联到 deleteSession，不再单列 session-orphans 补丁）。
const { patchSessionManage } = require('../patch-session-manage');
const { patchToolSourceCompat } = require('./tool-source-patch');
// pi-ai opencode-go 模型目录补丁（opencode-go.json 纯数据补充）。
const { patchPiAiOpencodeGoModels } = require('../patch-pi-ai-opencode-go-models');
// pi-ai 余额判定前置补丁（F2：第三方 provider 欠费 401+CreditsError 误判 AUTH
// →「API key is invalid」；此前仅 postinstall 应用，node_modules 刷新即丢，v0.5.3
// payload 实测缺失，补进 boot 期注册表幂等自愈）。
const { patchPiAiCredits } = require('../patch-pi-ai-credits');
// pi-ai 手声明路由思考档位默认（F4：v0.5.3「第三方思考强度不生效」——自定义
// 供应商模型条目无 reasoningEfforts 字典时 pi-ai 回落 reasoning:false，控件
// 永不出现；手声明条目回落标准 OpenAI 档位字典，开箱即用且未选档位不发字段）。
const { patchPiAiReasoningDefaults } = require('../patch-pi-ai-reasoning-defaults');
// pi-ai 上下文超限友好文案补丁（第三方 OpenAI 兼容端点裸 400/413 无响应体
// → 上下文超限提示，避免「400 status code (no body)」死谜语）。
const { patchPiAiOverflowMessage } = require('../patch-pi-ai-overflow-message');
// dsh-token-meter messageTokens 下限夹取补丁（内核 accounting 边界：replace
// 负 delta 使 messageTokens 溢出为负 → tokenCount nonnegative 校验失败；只用于
// 「上下文构成」估算展示/计量，夹 0 不影响真实请求）。
const { patchTokenMeterClamp } = require('../patch-token-meter-clamp');
// 设置写入韧性（PR5：v0.5.2「添加供应商没反应/灰」两层根治——孤儿锁自愈 +
// 设置页命名空间自愈 + settings-conflict 静默重试）。
const {
  patchAtomicWriteOrphanLock,
  patchSettingsModelsResilience,
} = require('./patch-settings-write-resilience');
// 插件 client bundle 到达瞬态失败重试（E2/问题A：bundle script ... failed to
// load 单次 404/换内核即永久失败——浏览器半边 script 重试 + serveBundle 读盘
// 瞬态码短重试）。
const { patchBundleArrivalRetry } = require('./bundle-arrival-retry-patch');
// 工具调度器缺席防崩（E2/问题B：reading 'prepare'——agent-loop 跨副本解析守卫 +
// dsh-tools Symbol.for 全局镜像）。
const { patchSchedulerGuard } = require('./scheduler-guard-patch');
// 工具调用 name 为空指引（unknown tool ""——ToolNotFoundError 对空 name 特判
// 三向指引：协议错位 / 中转网关剥离 / 模型输出崩坏，非空 name 原语义不变）。
const { patchEmptyToolName } = require('./empty-tool-name-patch');

// ---------------------------------------------------------------------------
// 文本模型自动识图补丁（原 main.js applyImageSendFix 内联 transform）。
// ---------------------------------------------------------------------------
const IMAGE_SEND_MARKER = 'DSH Desktop: reuse the dsh-vision VLM config';
const IMAGE_SEND_HELPER_ANCHOR = '/** Validate one prompt as a batch before publishing any durable image object. */';
const IMAGE_SEND_HELPER = `
/** DSH Desktop: reuse the dsh-vision VLM config to describe images as text so text-only models can "see" them. */
async function describeImagesWithVision(ctx, content) {
	const settings = ctx.get("settings");
	let vision = null;
	if (settings !== void 0 && typeof settings.get === "function") {
		// dsh-desktop fix: read the resolved HOST-side value (settings.get), not the
		// redacted wire snapshot. redactSecrets strips role('secret') fields, so
		// describe({redactSecrets:true}) drops apiKey and every keyed VLM endpoint
		// answers 401 — image sends failed for configured users.
		const resolved = settings.get("dsh-vision");
		if (resolved !== void 0 && typeof resolved === "object") vision = resolved;
	}
	if (vision === null && settings !== void 0 && typeof settings.describe === "function") {
		try {
			const descriptor = settings.describe({ redactSecrets: true }).find((candidate) => String(candidate.ns) === "dsh-vision");
			if (descriptor !== void 0 && descriptor.value !== void 0 && typeof descriptor.value === "object") vision = descriptor.value;
		} catch {}
	}
	// DSH Desktop: dsh-vision master switch (enabled) — off means the user turned
	// the whole capability off in 设置 → 识图插件：skip conversion and flag the
	// throw so the gate below restores the upstream MODEL_DOES_NOT_SUPPORT_IMAGES
	// rejection (the exact pre-plugin behavior: images neither sent nor converted).
	if (vision !== null && vision.enabled === false) {
		const visionDisabled = new Error("dsh-vision disabled");
		visionDisabled.dshVisionDisabled = true;
		throw visionDisabled;
	}
	if (vision === null || typeof vision.baseURL !== "string" || vision.baseURL.trim() === "" || typeof vision.model !== "string" || vision.model.trim() === "") {
		throw new Error("未配置识图服务：请到 设置 → 识图插件（view_image） 填写 VLM 接口地址与模型");
	}
	const apiKey = typeof vision.apiKey === "string" ? vision.apiKey.trim() : "";
	const endpoint = vision.baseURL.replace(/\\/+$/, "") + "/chat/completions";
	const out = [];
	let imageNo = 0;
	for (const part of content) {
		if (part.type !== "image") {
			if (part.type === "text") out.push(part);
			continue;
		}
		imageNo += 1;
		const dataUrl = \`data:\${part.mediaType};base64,\${part.data}\`;
		const payload = {
			model: vision.model,
			stream: false,
			messages: [
				{ role: "system", content: "You are an image understanding assistant. Describe the image in exhaustive detail and transcribe every visible text (OCR). If it is a UI, document, table, chart or code, preserve its structure. Answer in Chinese unless the user's language clearly differs." },
				{ role: "user", content: [
					{ type: "text", text: "请把这张图片完整转述为文字：包含画面内容、结构与全部可见文字（逐字 OCR）。" },
					{ type: "image_url", image_url: { url: dataUrl } }
				] }
			]
		};
		const headers = { "content-type": "application/json" };
		if (apiKey !== "") headers.authorization = "Bearer " + apiKey;
		const response = await fetch(endpoint, {
			method: "POST",
			headers,
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(120000)
		});
		if (!response.ok) {
			const bodyText = await response.text().catch(() => "");
			throw new Error("识图服务返回 HTTP " + response.status + "：" + bodyText.slice(0, 400));
		}
		const data = await response.json();
		const description = data && data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "";
		if (typeof description !== "string" || description.trim() === "") throw new Error("识图服务未返回有效文字描述");
		out.push({ type: "text", text: "[图片" + imageNo + "] " + description.trim() });
	}
	return out;
}
`;
const IMAGE_SEND_GATE_MARKER = 'if (modelInfo.inputModalities !== void 0 && !modelInfo.inputModalities.includes("image")) return err(request, {';
const IMAGE_SEND_GATE_NEW = `if (modelInfo.inputModalities !== void 0 && !modelInfo.inputModalities.includes("image")) {
								try {
									admittedContent = await describeImagesWithVision(ctx, content);
								} catch (error) {
									if (error && error.dshVisionDisabled === true) {
										return err(request, {
											code: 'attachment-error',
											message: \`Model "\${current.model}" does not support image input.\`,
											details: { reason: 'MODEL_DOES_NOT_SUPPORT_IMAGES' }
										});
									}
									return err(request, {
										code: "attachment-error",
										message: \`图片自动转述失败：\${error instanceof Error ? error.message : String(error)}。请在 设置 → 识图插件（view_image） 配置 VLM 后重试。\`,
										details: { reason: "IMAGE_DESCRIPTION_FAILED" }
									});
								}
							}`;

function transformImageSendFix(src, file) {
  if (src.includes(IMAGE_SEND_MARKER)) return { status: 'already' };
  // 上游已原生内置同名 helper（新版 dsh）：不重复插入（重复定义会留下
  // 被后者遮蔽的死代码），只做门槛替换；其 apiKey 脱敏缺陷由
  // transformVisionKeyFix 就地修复。
  const nativeHelper = src.includes('async function describeImagesWithVision');
  if (!nativeHelper) {
    // 1) 插入转述 helper（此后所有索引必须基于插入后的 src 重新计算）
    const anchorIdx = src.indexOf(IMAGE_SEND_HELPER_ANCHOR);
    if (anchorIdx === -1) {
      return { status: 'anchor-missing', detail: '未找到 helper 插入锚点（版本可能已变更），跳过 ' + file };
    }
    src = src.slice(0, anchorIdx) + IMAGE_SEND_HELPER + '\n' + src.slice(anchorIdx);
  }
  // 2) prompt 入口：声明 admittedContent
  const hasImageIdx = src.indexOf('const hasImage = content.some((part) => part.type === "image");');
  if (hasImageIdx === -1) {
    return { status: 'anchor-missing', detail: '未找到 hasImage 入口（版本可能已变更），跳过 ' + file };
  }
  src = src.slice(0, hasImageIdx) + 'let admittedContent = content;\n\t\t\t\t' + src.slice(hasImageIdx);
  // 3) 把“模型不支持图片”的直接拒绝替换为自动转述
  const gateIdx = src.indexOf(IMAGE_SEND_GATE_MARKER);
  if (gateIdx === -1) {
    return { status: 'anchor-missing', detail: '未找到模型图片门槛（版本可能已变更），跳过 ' + file };
  }
  const gateEnd = src.indexOf('});', gateIdx);
  if (gateEnd === -1) {
    return { status: 'anchor-missing', detail: '图片门槛收尾异常，跳过 ' + file };
  }
  src = src.slice(0, gateIdx) + IMAGE_SEND_GATE_NEW + src.slice(gateEnd + 3);
  // 4) durablePromptContent 使用转述后的内容（从门槛之后查找调用点，避免命中函数定义）
  const callIdx = src.indexOf('durablePromptContent(ctx, content)', gateIdx);
  if (callIdx === -1) {
    return { status: 'anchor-missing', detail: '未找到 durablePromptContent 调用，跳过 ' + file };
  }
  src = src.slice(0, callIdx) + 'durablePromptContent(ctx, admittedContent)' + src.slice(callIdx + 'durablePromptContent(ctx, content)'.length);
  return { status: 'changed', src };
}

// ---------------------------------------------------------------------------
// 图片自动转述 apiKey 修复（原 main.js applyVisionKeyFix 内联 transform）。
// ---------------------------------------------------------------------------
const VISION_KEY_MARKER = 'dsh-desktop fix: read the resolved HOST-side value';
const VISION_KEY_FROM = '\tlet vision = null;\n\tif (settings !== void 0 && typeof settings.describe === "function") {\n\t\ttry {\n\t\t\tconst descriptor = settings.describe({ redactSecrets: true }).find((candidate) => String(candidate.ns) === "dsh-vision");\n\t\t\tif (descriptor !== void 0 && descriptor.value !== void 0 && typeof descriptor.value === "object") vision = descriptor.value;\n\t\t} catch {}\n\t}';
const VISION_KEY_TO = '\tlet vision = null;\n\tif (settings !== void 0 && typeof settings.get === "function") {\n\t\t// dsh-desktop fix: read the resolved HOST-side value (settings.get), not the\n\t\t// redacted wire snapshot. redactSecrets strips role(\'secret\') fields, so\n\t\t// describe({redactSecrets:true}) drops apiKey and every keyed VLM endpoint\n\t\t// answers 401 — image sends failed for configured users.\n\t\tconst resolved = settings.get("dsh-vision");\n\t\tif (resolved !== void 0 && typeof resolved === "object") vision = resolved;\n\t}\n\tif (vision === null && settings !== void 0 && typeof settings.describe === "function") {\n\t\ttry {\n\t\t\tconst descriptor = settings.describe({ redactSecrets: true }).find((candidate) => String(candidate.ns) === "dsh-vision");\n\t\t\tif (descriptor !== void 0 && descriptor.value !== void 0 && typeof descriptor.value === "object") vision = descriptor.value;\n\t\t} catch {}\n\t}';

function transformVisionKeyFix(src, file) {
  if (src.includes(VISION_KEY_MARKER)) return { status: 'already' };
  if (!src.includes(VISION_KEY_FROM)) {
    return { status: 'anchor-missing', detail: '锚点未匹配（版本可能已变化），跳过 ' + file };
  }
  return { status: 'changed', src: src.replace(VISION_KEY_FROM, VISION_KEY_TO) };
}

// ---------------------------------------------------------------------------
// 识图总开关（enabled）门槛增量补丁：image-send-fix 已应用的旧树上补挂
// 「dsh-vision 关闭 → 不转述、按上游原样拒绝」。IMAGE_SEND_MARKER 相同而
// 内容已升级，旧树永远走 already 分支拿不到新常量，因此按 vision-key-fix
// 的先例单列 transform 与 marker；两处锚点（helper 配置检查行 / gate 调用
// 行）在旧树与新树均存在，产物与新版 IMAGE_SEND_HELPER / IMAGE_SEND_GATE_NEW
// 直接生成的字节一致（新树靠 marker 短路 already，不会重复插入）。
// ---------------------------------------------------------------------------
const VISION_TOGGLE_MARKER = 'DSH Desktop: dsh-vision master switch (enabled)';
const VISION_TOGGLE_HELPER_ANCHOR = '\tif (vision === null || typeof vision.baseURL !== "string" || vision.baseURL.trim() === "" || typeof vision.model !== "string" || vision.model.trim() === "") {';
const VISION_TOGGLE_HELPER_CHECK = [
  '\t// DSH Desktop: dsh-vision master switch (enabled) — off means the user turned',
  '\t// the whole capability off in 设置 → 识图插件：skip conversion and flag the',
  '\t// throw so the gate below restores the upstream MODEL_DOES_NOT_SUPPORT_IMAGES',
  '\t// rejection (the exact pre-plugin behavior: images neither sent nor converted).',
  '\tif (vision !== null && vision.enabled === false) {',
  '\t\tconst visionDisabled = new Error("dsh-vision disabled");',
  '\t\tvisionDisabled.dshVisionDisabled = true;',
  '\t\tthrow visionDisabled;',
  '\t}',
  '',
].join('\n');
// 旧 gate 的 catch 头（含转述调用行作唯一性前缀，避免命中文件内其它 catch）。
const VISION_TOGGLE_GATE_FROM = '\t\t\t\t\t\t\t\t\tadmittedContent = await describeImagesWithVision(ctx, content);\n\t\t\t\t\t\t\t\t} catch (error) {\n\t\t\t\t\t\t\t\t\treturn err(request, {';
const VISION_TOGGLE_GATE_TO = [
  '\t\t\t\t\t\t\t\t\tadmittedContent = await describeImagesWithVision(ctx, content);',
  '\t\t\t\t\t\t\t\t} catch (error) {',
  '\t\t\t\t\t\t\t\t\tif (error && error.dshVisionDisabled === true) {',
  '\t\t\t\t\t\t\t\t\t\treturn err(request, {',
  "\t\t\t\t\t\t\t\t\t\t\tcode: 'attachment-error',",
  '\t\t\t\t\t\t\t\t\t\t\tmessage: `Model "${current.model}" does not support image input.`,',
  "\t\t\t\t\t\t\t\t\t\t\tdetails: { reason: 'MODEL_DOES_NOT_SUPPORT_IMAGES' }",
  '\t\t\t\t\t\t\t\t\t\t});',
  '\t\t\t\t\t\t\t\t\t}',
  '\t\t\t\t\t\t\t\t\treturn err(request, {',
].join('\n');

function transformVisionToggleGate(src, file) {
  if (src.includes(VISION_TOGGLE_MARKER)) return { status: 'already' };
  // helper 不存在 = image-send-fix 本身没打上（或上游原生内置 helper 且无该
  // 检查行）——本补丁无从谈起，按失配跳过。
  const helperIdx = src.indexOf(VISION_TOGGLE_HELPER_ANCHOR);
  const gateIdx = src.indexOf(VISION_TOGGLE_GATE_FROM);
  if (helperIdx === -1 || gateIdx === -1) {
    return { status: 'anchor-missing', detail: '未找到识图 helper/门槛锚点（版本可能已变更或 image-send 未应用），跳过 ' + file };
  }
  const out = src.replace(VISION_TOGGLE_HELPER_ANCHOR, VISION_TOGGLE_HELPER_CHECK + VISION_TOGGLE_HELPER_ANCHOR)
    .replace(VISION_TOGGLE_GATE_FROM, VISION_TOGGLE_GATE_TO);
  return { status: 'changed', src: out };
}

// ---------------------------------------------------------------------------
// dsh 装配层防护：profile patch 损坏自愈加载（原 applyProfilePatchGuard）。
// ---------------------------------------------------------------------------
const PROFILE_PATCH_GUARD_MARKER = 'function loadUserPatchLayer';
const PROFILE_PATCH_GUARD_CALL_SITE = '\t\tpatches: options.userLayer !== false && existsSync(patchPath) ? loadOverlayPatches(binName, patchPath) : []';
const PROFILE_PATCH_GUARD_CALL_REPLACEMENT = '\t\tpatches: loadUserPatchLayer(binName, patchPath, options)';
const PROFILE_PATCH_GUARD_INSERT_AFTER = '\treturn parsePatchList(binName, file, content, "overlay");\n}';
const PROFILE_PATCH_GUARD_INJECTED =
  '/** dsh-desktop guard: the profile\'s own patch layer is user-owned data; a broken file must not brick\n' +
  ' * the surface. Back the broken file up, reset the layer to an empty list, and boot without it.\n' +
  ' */\n' +
  'function loadUserPatchLayer(binName, patchPath, options) {\n' +
  '\tif (options.userLayer === false || !existsSync(patchPath)) return [];\n' +
  '\ttry {\n' +
  '\t\treturn loadOverlayPatches(binName, patchPath);\n' +
  '\t} catch (error) {\n' +
  '\t\ttry {\n' +
  '\t\t\tconst backup = `${patchPath}.broken-${Date.now()}`;\n' +
  '\t\t\twriteFileSync(backup, readFileSync(patchPath, "utf8"));\n' +
  '\t\t\twriteFileSync(patchPath, "# recovered by dsh: the previous content failed to parse and was moved to\\n# " + backup + "\\n[]\\n");\n' +
  '\t\t} catch {}\n' +
  '\t\tprocess.stderr.write(`${binName}: ${patchPath} failed to parse (${String(error?.message ?? error)}); the broken file was moved aside and the profile booted without its patch layer\\n`);\n' +
  '\t\treturn [];\n' +
  '\t}\n' +
  '}';

function transformProfilePatchGuard(src, file) {
  if (src.includes(PROFILE_PATCH_GUARD_MARKER)) return { status: 'already' }; // 已应用（幂等，静默）
  if (!src.includes(PROFILE_PATCH_GUARD_CALL_SITE) || !src.includes(PROFILE_PATCH_GUARD_INSERT_AFTER)) {
    return { status: 'anchor-missing', detail: file + ' 锚点未匹配（dsh 版本可能已变化），跳过' };
  }
  const out = src.replace(PROFILE_PATCH_GUARD_CALL_SITE, PROFILE_PATCH_GUARD_CALL_REPLACEMENT);
  return { status: 'changed', src: out.replace(PROFILE_PATCH_GUARD_INSERT_AFTER, PROFILE_PATCH_GUARD_INSERT_AFTER + '\n\n' + PROFILE_PATCH_GUARD_INJECTED) };
}

// ---------------------------------------------------------------------------
// profile bundle 装配防护（原 applyProfileBundleGuard 的两个 transform）。
// ---------------------------------------------------------------------------
function transformProfileBundleAppBoot(src, file) {
  const out = applyAppBootBundleGuard(src);
  if (!out.changed) {
    if (!src.includes(PROFILE_BUNDLE_GUARD_MARKER)) {
      return { status: 'anchor-missing', detail: file + ' 锚点未匹配（dsh 版本可能已变化），跳过' };
    }
    return { status: 'already' }; // 已注入（幂等，静默）
  }
  return { status: 'changed', src: out.src };
}

// rc.8 起 dsh 主包的两个 profile-boot-*.js 中可能有一个是纯 re-export 存根
// （如 `import { o as runProfile } from "./profile-boot-DG5t9aNs.js"; export { runProfile };`），
// 真实装配面在另一个 bundle 里（由它自身的注入覆盖）。存根没有可守护的代码，
// 不算版本漂移，按已处理跳过，避免每次启动误报失配。
const PROFILE_BOOT_STUB_RE = /^import\s*\{[^}]+\}\s*from\s*"\.\/profile-boot-[A-Za-z0-9_-]+\.js";\s*export\s*\{[^}]+\};?\s*$/;

function transformProfileBundleProfileBoot(src, file) {
  let current = src;
  // rc.8 纯 re-export 存根：无 heal/bundle 装配面，无需补丁（幂等静默）。
  if (PROFILE_BOOT_STUB_RE.test(current.trim())) return { status: 'already' };
  let changed = false;
  // heal 调用防护（独立幂等标记）：入口 bundle 无 heal 调用时静默。
  const heal = applyProfileBootHealGuard(current);
  if (heal.changed) { current = heal.src; changed = true; }
  const bundle = applyProfileBootBundleGuard(current);
  if (bundle.changed) { current = bundle.src; changed = true; }
  if (changed) return { status: 'changed', src: current };
  if (!current.includes(PROFILE_BOOT_GUARD_MARKER)) {
    return { status: 'anchor-missing', detail: file + ' 锚点未匹配（dsh 版本可能已变化），跳过' };
  }
  return { status: 'already' }; // 已注入（幂等，静默）
}

// ---------------------------------------------------------------------------
// dsh-settings 注册防护（原 applySettingsSectionGuard 内联 transform）。
// ---------------------------------------------------------------------------
const SETTINGS_SECTION_MARKER = 'dsh-desktop guard: an invalid stored section must not brick';
// 0.1.2-alpha.2：消费侧胶水函数（sctx.settings.register）重构为 provider 类方法
// installSection（pristine dsh-settings/lib/index.js 实证），register 调用点改为
// this.register、缩进不变（2-tab）。守卫语义零变化：register 抛错（存储 section
// 损坏 resolve 失败）不再击穿消费方 fiber，回落 composition 配置，命名空间本次
// boot 不可用。logger 接收方同步改 this.ctx.logger（alpha.2 同类内既有用法，
// 如 "keeping last good" 分支）。
const SETTINGS_SECTION_ANCHOR = '\t\tconst scope = this.register(ns, schema, {';
const SETTINGS_SECTION_GUARDED =
  '\t\tlet scope;\n' +
  '\t\ttry {\n' +
  '\t\t\tscope = this.register(ns, schema, {\n' +
  '\t\t\t\tbase: entry,\n' +
  '\t\t\t\t...hooks.validate === void 0 ? {} : { validate: hooks.validate }\n' +
  '\t\t\t});\n' +
  '\t\t} catch (error) {\n' +
  '\t\t\t// dsh-desktop guard: an invalid stored section must not brick the consumer\n' +
  '\t\t\t// fiber (fail-loud boot). Fall back to the composition config; the\n' +
  '\t\t\t// namespace simply stays unavailable until the stored section is fixed.\n' +
  '\t\t\tthis.ctx.logger.warn("settings: registration for \\"%s\\" failed; falling back to the composition config this boot", ns);\n' +
  '\t\t\tthis.ctx.logger.warn(error);\n' +
  '\t\t\ttry {\n' +
  '\t\t\t\thooks.setSource(() => entry);\n' +
  '\t\t\t\thooks.onChange();\n' +
  '\t\t\t} catch {}\n' +
  '\t\t\treturn;\n' +
  '\t\t}\n' +
  '\t\thooks.setSource(() => scope.get());';
const SETTINGS_SECTION_FROM = '\t\tconst scope = this.register(ns, schema, {\n\t\t\tbase: entry,\n\t\t\t...hooks.validate === void 0 ? {} : { validate: hooks.validate }\n\t\t});\n\t\thooks.setSource(() => scope.get());';

function transformSettingsSectionGuard(src, file) {
  if (src.includes(SETTINGS_SECTION_MARKER)) return { status: 'already' }; // 已应用（幂等，静默）
  if (!src.includes(SETTINGS_SECTION_ANCHOR)) {
    return { status: 'anchor-missing', detail: file + ' 锚点未匹配（dsh 版本可能已变化），跳过' };
  }
  return { status: 'changed', src: src.replace(SETTINGS_SECTION_FROM, SETTINGS_SECTION_GUARDED) };
}

// ---------------------------------------------------------------------------
// dsh-client-ui-workspace 搜索栏修复（原 applyWorkspaceSearchRailFix）。
// 已退役（v0.6.0 alpha.2 重靶期，注册表条目已摘除）：0.1.2-alpha.2 上游原生
// 包含同款守卫（guard + deps 双全，pristine :L1991 实证），补丁无增量。
// 定义休眠保留（参照 session-event-bound / load-all-history 先例），仅供
// 历史安装副本回滚审计与 rc.7 及更早形态参考。
// ---------------------------------------------------------------------------
const WORKSPACE_SEARCH_RAIL_MARKER = 'dsh-desktop fix: rail search expansion';
// rc.8 起上游原生包含了同款守卫（无 marker 注释的裸形态）：`if (!wide ||
// !searchExpanded || searchOnExpand) return;`。命中即视为已修复（幂等），
// rc.7 及更早仍走下方 OLD 锚点路径（双形态兼容）。
const WORKSPACE_SEARCH_RAIL_NATIVE = 'if (!wide || !searchExpanded || searchOnExpand) return;';
const WORKSPACE_SEARCH_RAIL_OLD_GUARD = '\t\t\t\tif (!wide || !searchExpanded) return;';
const WORKSPACE_SEARCH_RAIL_NEW_GUARD = '\t\t\t\tif (!wide || !searchExpanded || searchOnExpand) return; // ' + WORKSPACE_SEARCH_RAIL_MARKER;
const WORKSPACE_SEARCH_RAIL_OLD_DEPS = '\t\t\t}, [\n\t\t\t\tnormalizedQuery,\n\t\t\t\twide,\n\t\t\t\tsearchExpanded\n\t\t\t]);';
const WORKSPACE_SEARCH_RAIL_NEW_DEPS = '\t\t\t}, [\n\t\t\t\tnormalizedQuery,\n\t\t\t\twide,\n\t\t\t\tsearchExpanded,\n\t\t\t\tsearchOnExpand\n\t\t\t]);';

function transformWorkspaceSearchRailFix(src, file) {
  if (src.includes(WORKSPACE_SEARCH_RAIL_MARKER)) return { status: 'already' };
  // rc.8+ 原生守卫（无 marker）：视为已修复，不算版本漂移。
  if (src.includes(WORKSPACE_SEARCH_RAIL_NATIVE)) return { status: 'already' };
  if (!src.includes(WORKSPACE_SEARCH_RAIL_OLD_GUARD) || !src.includes(WORKSPACE_SEARCH_RAIL_OLD_DEPS)) {
    return { status: 'anchor-missing', detail: '锚点未匹配（dsh 版本可能已变化），跳过 ' + file };
  }
  return { status: 'changed', src: src.replace(WORKSPACE_SEARCH_RAIL_OLD_GUARD, WORKSPACE_SEARCH_RAIL_NEW_GUARD).replace(WORKSPACE_SEARCH_RAIL_OLD_DEPS, WORKSPACE_SEARCH_RAIL_NEW_DEPS) };
}

// ---------------------------------------------------------------------------
// K25 手动排序拖拽失效修复（dsh-client-ui-workspace 会话行拖拽）。
//
// 根因：会话行 HTML5 拖拽在 onDragStart 里 setDrag（React 18 批处理，非离散
// 事件默认优先级，不保证同步 flush），随后浏览器连续派发 dragover/drop 时，
// 行级 onDragOver/onDrop 闭包里的 `drag.active`（渲染期布尔）仍是上一次渲染的
// false，导致 e.preventDefault() 未执行 → 浏览器判定目标不可 drop → 拖拽无效，
// 顺序既未提交也未持久化。修法：在 onDragStart 内用 react-dom 的 flushSync 同步
// 提交 drag 状态，确保首个 dragover 到达前 drag.active 已更新为 true。
// 仅改会话行（node.id）拖拽起点，不动工作区行（row.key）、不动排序/持久化逻辑。
// ---------------------------------------------------------------------------
const MANUAL_SORT_DRAG_MARKER = 'dsh-desktop fix: manual sort drag sync';

const MANUAL_SORT_DRAG_REQUIRE_ANCHOR = 'let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");';
const MANUAL_SORT_DRAG_REQUIRE_INSERT = MANUAL_SORT_DRAG_REQUIRE_ANCHOR + '\n\t\tlet react_dom = require("react-dom"); // ' + MANUAL_SORT_DRAG_MARKER;

const MANUAL_SORT_DRAG_START_ANCHOR = 'e.dataTransfer.setData("text/plain", node.id);\n\t\t\t\t\t\tdrag.start();';
const MANUAL_SORT_DRAG_START_FIX = 'e.dataTransfer.setData("text/plain", node.id);\n\t\t\t\t\t\treact_dom.flushSync(() => {\n\t\t\t\t\t\t\tdrag.start();\n\t\t\t\t\t\t});';

function transformManualSortFix(src, file) {
  if (src.includes(MANUAL_SORT_DRAG_MARKER)) return { status: 'already' };
  if (!src.includes(MANUAL_SORT_DRAG_REQUIRE_ANCHOR) || !src.includes(MANUAL_SORT_DRAG_START_ANCHOR)) {
    return { status: 'anchor-missing', detail: '锚点未匹配（dsh 版本可能已变化），跳过 ' + file };
  }
  let out = src.replace(MANUAL_SORT_DRAG_REQUIRE_ANCHOR, MANUAL_SORT_DRAG_REQUIRE_INSERT);
  out = out.replace(MANUAL_SORT_DRAG_START_ANCHOR, MANUAL_SORT_DRAG_START_FIX);
  return { status: 'changed', src: out };
}

// ---------------------------------------------------------------------------
// 插件页标签合并补丁（原 applyPluginInventoryTabMergeFix）。
// ---------------------------------------------------------------------------
const PLUGIN_INVENTORY_TAB_MARKER = 'dsh-desktop fix: hide inventory tab';
const PLUGIN_INVENTORY_TAB_OLD = 'tabs = ctx.slots.entries("settings.plugins.tab").map((entry) => ({';
const PLUGIN_INVENTORY_TAB_NEW = 'tabs = ctx.slots.entries("settings.plugins.tab").filter((entry) => (entry.options.id ?? "") !== "all").map((entry) => ({ // ' + PLUGIN_INVENTORY_TAB_MARKER;

function transformPluginInventoryTabMergeFix(src, file) {
  if (src.includes(PLUGIN_INVENTORY_TAB_MARKER)) return { status: 'already' };
  if (!src.includes(PLUGIN_INVENTORY_TAB_OLD)) {
    return { status: 'anchor-missing', detail: '锚点未匹配（dsh 版本可能已变化），跳过 ' + file };
  }
  return { status: 'changed', src: src.replace(PLUGIN_INVENTORY_TAB_OLD, PLUGIN_INVENTORY_TAB_NEW) };
}

// ---------------------------------------------------------------------------
// 持久 shell 停止修复（会话内停止任务停不下来，Windows 主现场）。
//
// 根因（调查定案）：持久 shell 工具 executeCommand 里 `await operation.done`
// 在用户中止后只能等 PTY 侧 300s 发送超时才醒来——中止动作只是向 PTY 写
// \x03，对 trap/忽略 SIGINT 的命令（dev server 等）无效；而兜底杀梯
// （SIGTERM/SIGKILL descendants）在 Windows 上因 node-pty 1.2.0-beta.15
// 返回 pid=0、rootIdentity 恒 undefined 而恒空，是死代码。实测
// terminal.kill()（经 shells.reset 收口）能杀掉附着进程（含 Ctrl+C 掩码者）。
//
// 修法：`await operation.done` 改为与「工具 signal 的 abort latch」race；
// abort 先醒即 shells.reset(...) 复位会话，让 terminal.kill() 生效。正常
// 完成路径逐字不变（race 只加 abort 分支）；pwsh / bash 两包共用同一
// transform，方言（reset reason 措辞）按包内既有字面量推导。
// 上游修复意向：上游在 persistent 工具内内置 abort race 后，本补丁经
// already / anchor-missing 自然退役（参照 vision-key-fix 休眠先例）。
// ---------------------------------------------------------------------------
const PERSISTENT_ABORT_RACE_MARKER = 'dsh-desktop fix: race the persistent send against tool abort';
const PERSISTENT_ABORT_RACE_ANCHOR = '\t\t\t\tfirst = false;\n\t\t\t\tresult = await operation.done;';
// `upstream` 形参名护栏：注入代码直接引用 upstream；若上游重命名形参而
// 锚点串恰好仍命中，会在运行时抛 ReferenceError。此锚点证明 executeCommand
// 内仍是 `deadline(upstream, ...)` 原名，缺它按失配跳过（不冒险注入）。
const PERSISTENT_ABORT_RACE_SCOPE_GUARD = 'deadline(upstream, config.timeoutMs, TIMEOUT_CODE)';

function persistentAbortRaceInjection(reason) {
  return '\t\t\t\tfirst = false;\n' +
    '\t\t\t\t// ' + PERSISTENT_ABORT_RACE_MARKER + '. On Windows the kill ladder is dead code\n' +
    '\t\t\t\t// (node-pty 1.2.0-beta.15 reports pid=0, so descendants() never resolves the tree)\n' +
    '\t\t\t\t// and a bare \\x03 cannot stop commands that trap/ignore SIGINT (dev servers),\n' +
    '\t\t\t\t// so this await used to hang until the 300s send timeout. Racing the tool abort\n' +
    '\t\t\t\t// signal lets us reset now; terminal.kill() does kill attached processes.\n' +
    '\t\t\t\tconst abortWake = { dshDesktopToolAbort: true };\n' +
    '\t\t\t\tlet wakeOnToolAbort = null;\n' +
    '\t\t\t\tconst abortLatch = new Promise((wake) => {\n' +
    '\t\t\t\t\twakeOnToolAbort = () => wake(abortWake);\n' +
    '\t\t\t\t\tif (upstream.aborted) wake(abortWake);\n' +
    '\t\t\t\t\telse upstream.addEventListener("abort", wakeOnToolAbort, { once: true });\n' +
    '\t\t\t\t});\n' +
    '\t\t\t\ttry {\n' +
    '\t\t\t\t\tresult = await Promise.race([operation.done, abortLatch]);\n' +
    '\t\t\t\t\tif (result === abortWake) {\n' +
    '\t\t\t\t\t\tawait shells.reset(owner, "' + reason + '");\n' +
    '\t\t\t\t\t\tcommandDeadline.signal.throwIfAborted();\n' +
    '\t\t\t\t\t}\n' +
    '\t\t\t\t} finally {\n' +
    '\t\t\t\t\tif (wakeOnToolAbort !== null) upstream.removeEventListener("abort", wakeOnToolAbort);\n' +
    '\t\t\t\t}';
}

function transformPersistentShellAbortRace(src, file) {
  if (src.includes(PERSISTENT_ABORT_RACE_MARKER)) return { status: 'already' };
  if (!src.includes(PERSISTENT_ABORT_RACE_ANCHOR) || !src.includes(PERSISTENT_ABORT_RACE_SCOPE_GUARD)) {
    return { status: 'anchor-missing', detail: '锚点未匹配（版本可能已变化），跳过 ' + file };
  }
  // 方言推导：复用包内既有中止分支的 reason 字面量，注入分支与其一致。
  for (const reason of ['persistent pwsh command aborted', 'persistent bash command aborted']) {
    if (src.includes('"' + reason + '"')) {
      return { status: 'changed', src: src.replace(PERSISTENT_ABORT_RACE_ANCHOR, persistentAbortRaceInjection(reason)) };
    }
  }
  return { status: 'anchor-missing', detail: '未识别持久 shell 方言（pwsh/bash reason 字面量缺失），跳过 ' + file };
}

// ---------------------------------------------------------------------------
// PTY 中断升级（dsh-terminal-bash interruptOnce）。
//
// 根因同上：中断只是 signalForeground("SIGINT")（Windows 上等价向 PTY 写
// \x03），对掩码 SIGINT 的前台命令无效；杀梯因 pid=0 恒空。中断后 operation
// 长时间不 settle，消费方只能等 300s 发送超时。
//
// 修法：中断发出后挂 2s 定时器，届时 operation 仍未 settle 且句柄仍 active
// → 直接 close("interrupt escalation") 复位会话（terminate 会杀附着进程，
// 并以 session_exit settle 挂起的发送），不再等 300s。
// 上游修复意向：上游内置中断升级后本补丁经 already / anchor-missing 退役。
// ---------------------------------------------------------------------------
const INTERRUPT_ESCALATION_MARKER = 'dsh-desktop fix: interrupt escalation';
// 0.1.2-alpha.1：`this.clearActive()` 重命名为 `this.releaseSettledActive()`（语义
// 不变：中断后 settle 即释放 active）。锚点与注入体同步改用新方法名。
const INTERRUPT_ESCALATION_ANCHOR = '\t\tif (this.active === operation && operation.settled) this.releaseSettledActive();\n\t\telse if (this.active === operation && !this.closing) {\n\t\t\tthis.pollingReady = operation;\n\t\t\tthis.schedulePoll(operation, 0);\n\t\t}\n\t}\n\tasync closeOnce(reason) {';
const INTERRUPT_ESCALATION_INJECTION =
  '\t\tif (this.active === operation && operation.settled) this.releaseSettledActive();\n' +
  '\t\telse if (this.active === operation && !this.closing) {\n' +
  '\t\t\tthis.pollingReady = operation;\n' +
  '\t\t\tthis.schedulePoll(operation, 0);\n' +
  '\t\t\t// ' + INTERRUPT_ESCALATION_MARKER + ': a bare SIGINT/\\x03 cannot stop foreground\n' +
  '\t\t\t// commands that trap or ignore it, and the pid-based kill ladder is dead code on\n' +
  '\t\t\t// Windows (node-pty 1.2.0-beta.15 reports pid=0). If the operation is still\n' +
  '\t\t\t// unsettled 2s after the interrupt, close the session: terminate() kills the\n' +
  '\t\t\t// attached process tree and settles the pending send with session_exit.\n' +
  '\t\t\tsetTimeout(() => {\n' +
  '\t\t\t\tif (this.active !== operation || operation.settled || this.closing) return;\n' +
  '\t\t\t\tthis.close("interrupt escalation").catch(() => {});\n' +
  '\t\t\t}, 2e3);\n' +
  '\t\t}\n' +
  '\t}\n' +
  '\tasync closeOnce(reason) {';

function transformTerminalInterruptEscalation(src, file) {
  if (src.includes(INTERRUPT_ESCALATION_MARKER)) return { status: 'already' };
  if (!src.includes(INTERRUPT_ESCALATION_ANCHOR)) {
    return { status: 'anchor-missing', detail: '锚点未匹配（版本可能已变化），跳过 ' + file };
  }
  return { status: 'changed', src: src.replace(INTERRUPT_ESCALATION_ANCHOR, INTERRUPT_ESCALATION_INJECTION) };
}

// ---------------------------------------------------------------------------
// agent-preset 未知 id 回落补丁（0.5.0 存量用户 resume 变砖修复）。
//
// 根因（真实用户 0.5.0 反馈）：Electron 老版本随包装过 minimal-win 预设，
// 用户 profile/会话 header 引用了它；0.5.0 Tauri 版内核 dsh-agent-presets 的
// roster 只有 standard/code/minimal/cordis，resolve() 查无此 id 即抛
// UnknownPresetError，resume 硬失败且无任何回落——会话永久变砖（第二轮白屏）。
//
// 修法：resolve() 的「查无此 id」分支改为 warn 降级回落（minimal-win→语义
// 最近的 minimal；其余未知 id→保底 standard；回落目标必须真实存在于 roster），
// 回落时 console.warn 中文日志（原 id / 回落目标 / 原因 / 原错误 message，保留
// 原错误对象信息便于诊断）。roster 全空或回落目标也缺失时维持原样抛错（此时
// 无可回落，硬抛是对的）。只动「Unknown」：PresetMountError（组合文件损坏 =
// 部署真坏了）不经本补丁、保持硬抛。
// 目标双文件：lib/index.js（运行时经 exports "." 实际加载的唯一入口）与同源
// 的 lib/invariant.js（无人加载，一并覆盖防未来消费方；两文件锚点文本一致）。
// 上游修复意向：上游在 resolve()/resume 链内置同款回落后，本补丁经 already /
// anchor-missing 自然退役（参照 vision-key-fix 休眠先例）。
// ---------------------------------------------------------------------------
const AGENT_PRESET_FALLBACK_MARKER = 'dsh-desktop fix: agent-preset-fallback';
// 0.1.2-alpha.1：resolve() 内层缩进从 2-tab 变为 3-tab（async resolve 内的 list 前
// 置声明层），锚点与注入体同步改用 3-tab 缩进。
// 0.1.2-alpha.2：UnknownPresetError 消失，查无此 id 改抛多行
// `new RemoteError("agent-preset/not-found", …, { agentPreset, available })`
// （pristine dsh-agent-presets/lib/index.js + 同源 invariant.js 实证，双文件锚点
// 文本一致）。锚点同步改用新形态；回落语义零变化——未知 id 先 warn 回落
// （minimal-win→minimal、其余未知 id→standard），无可回落目标时原样抛上游
// RemoteError（与旧补丁「保持原样抛错」等价），resolveMountable 的 broken 硬抛
// 不经本补丁。
const AGENT_PRESET_FALLBACK_ANCHOR = [
  '\t\t\tconst found = presets.find((preset) => preset.id === wanted);',
  '\t\t\tif (found === void 0) {',
  '\t\t\t\tconst available = presets.map((preset) => preset.id);',
  '\t\t\t\tthrow new RemoteError("agent-preset/not-found", `agent-presets: preset "${wanted}" not found (available: ${available.join(", ") || "none"})`, {',
  '\t\t\t\t\tagentPreset: wanted,',
  '\t\t\t\t\tavailable',
  '\t\t\t\t});',
  '\t\t\t}',
  '\t\t\treturn found;',
].join('\n');
const AGENT_PRESET_FALLBACK_INJECTION = [
  '\t\t\tconst found = presets.find((preset) => preset.id === wanted);',
  '\t\t\tif (found === void 0) {',
  '\t\t\t\tconst available = presets.map((preset) => preset.id);',
  '\t\t\t\t// dsh-desktop fix: agent-preset-fallback — a session or profile may reference a',
  '\t\t\t\t// preset id this deployment no longer ships (0.5.0 dropped the Electron-era',
  '\t\t\t\t// "minimal-win"). A hard not-found error here bricks resume forever; fall',
  '\t\t\t\t// back to the closest semantic preset and warn instead. Only "unknown id"',
  '\t\t\t\t// degrades — a broken-preset refusal stays a loud failure (mount paths',
  '\t\t\t\t// re-check the resolved preset after this resolve).',
  '\t\t\t\tconst fallbackId = wanted === "minimal-win" && available.includes("minimal") ? "minimal" : available.includes("standard") ? "standard" : void 0;',
  '\t\t\t\tconst fallback = fallbackId === void 0 ? void 0 : presets.find((preset) => preset.id === fallbackId);',
  '\t\t\t\tif (fallback !== void 0) {',
  '\t\t\t\t\tconsole.warn(`[dsh] agent-presets 预设回落：引用的预设 "${wanted}" 在当前安装中不存在（可用：${available.join(", ") || "无"}），已自动回落到语义最近的预设 "${fallback.id}"（原因：该预设随版本升级移除，回落规则 minimal-win→minimal、其余未知 id→standard）。会话将以回落预设继续恢复，建议在预设选择中重新挑选。原始错误：agent-presets: preset "${wanted}" not found`);',
  '\t\t\t\t\treturn fallback;',
  '\t\t\t\t}',
  '\t\t\t\tthrow new RemoteError("agent-preset/not-found", `agent-presets: preset "${wanted}" not found (available: ${available.join(", ") || "none"})`, {',
  '\t\t\t\t\tagentPreset: wanted,',
  '\t\t\t\t\tavailable',
  '\t\t\t\t});',
  '\t\t\t}',
  '\t\t\treturn found;',
].join('\n');

function transformAgentPresetFallback(src, file) {
  if (src.includes(AGENT_PRESET_FALLBACK_MARKER)) return { status: 'already' };
  if (!src.includes(AGENT_PRESET_FALLBACK_ANCHOR)) {
    return { status: 'anchor-missing', detail: '未找到 agent-presets resolve 抛错锚点（版本可能已变化），跳过 ' + file };
  }
  // 函数替换器：注入文本含 ${...} 模板字面量，规避 String.replace 对 $ 序列的替换语义。
  return { status: 'changed', src: src.replace(AGENT_PRESET_FALLBACK_ANCHOR, () => AGENT_PRESET_FALLBACK_INJECTION) };
}

// ---------------------------------------------------------------------------
// prompt-context-literal 补丁（context/section 文本里的字面 {{...}} 不再炸整轮）。
//
// 根因（真实用户现场）：内核 dsh-system-prompt 的 interpolate() 对所有 section
// 与 context 文本做 {{name}} 插值扫描，VARIABLE_NAME=/^[a-z][a-z0-9_]*$/：字面量
// {{state.gold}}（graph-memory 从图数据库 recall 出的节点/episode 内容，属不可信
// 数据而非模板作者手笔）名字带点 → malformed 硬抛 → 整轮 prompt 组装失败，会话
// 每轮必瘫。这是「不可信数据进了模板插值器」的经典注入类问题：任何把动态/用户
// 数据拼进 context 的插件都会中招。
//
// 修法：name 不合法（含点、大写、空格等）时不再硬抛，改为 console.warn（附
// kind / context 名 / 原文字面组 / 邻近片段）+ 按字面透传该组，渲染继续。
// **只放宽 name-invalid，不放宽 unknown-variable**（下一分支 {{合法名}} 但变量
// 未注册保持硬抛）：不合法名字出现在 context 文本里几乎必然是数据碰巧长得像
// 模板（DB 内容、用户粘贴文本），透传即用户本意；而合法名字的 {{name}} 是刻意的
// 模板作者语法（dsh-workspace-anchor 的 section 就有意引用 {{cwd}}），引用了未
// 注册变量是真实作者错误，静默透传会把真错误漏成悄悄不渲染的文本——必须响亮。
// value===void 0 分支同理不动（合法引用取到 undefined 属装配期真错误）。
// 与 graph-memory 插件侧 defuseTemplateGroups（打断 {{ / }} 序列，护存量 DB）
// 互补：插件净化护住本插件，内核放宽兜住其他一切动态数据源。
// 上游修复意向：上游在 interpolate 内置同款「无效名透传 + warn」后，本补丁经
// already / anchor-missing 自然退役（参照 vision-key-fix 休眠先例）。
// ---------------------------------------------------------------------------
const PROMPT_CONTEXT_LITERAL_MARKER = 'dsh-desktop fix: prompt-context-literal';
// 锚点 = interpolate() 的 name-invalid 抛错整行（含上一行 const name 取组名，
// 双行保证唯一；dsh-system-prompt lib/index.js:117-118 逐字抄录）。
const PROMPT_CONTEXT_LITERAL_ANCHOR = '\t\tconst name = group[0].slice(2, -2);\n\t\tif (!VARIABLE_NAME.test(name)) throw new Error(`malformed prompt variable reference "{{${name}}}" in ${kind} "${input.name}" (variable names match ${String(VARIABLE_NAME)})`);';
const PROMPT_CONTEXT_LITERAL_INJECTION = [
  '\t\tconst name = group[0].slice(2, -2);',
  '\t\tif (!VARIABLE_NAME.test(name)) {',
  '\t\t\t// dsh-desktop fix: prompt-context-literal — context/section text is often',
  '\t\t\t// untrusted data (graph-memory recalls DB node/episode content verbatim),',
  '\t\t\t// so a stored literal like {{state.gold}} reaching this scanner is not a',
  '\t\t\t// template authoring error. Pass the group through verbatim and warn instead',
  '\t\t\t// of killing the whole prompt assembly. Only the invalid-name case is',
  '\t\t\t// relaxed: the unknown-variable throw below stays loud, because a valid',
  '\t\t\t// {{name}} that resolves to nothing IS a real author error',
  '\t\t\t// (dsh-workspace-anchor sections intentionally reference {{cwd}}).',
  '\t\t\tconsole.warn(`[dsh] system-prompt: ${kind} "${input.name}" carries literal "${group[0]}" which is not a variable reference (names match ${String(VARIABLE_NAME)}); passing through unchanged. Fragment: ${JSON.stringify(text.slice(open, open + 32))}`);',
  '\t\t\tresult += text.slice(last, open) + group[0];',
  '\t\t\tlast = open + group[0].length;',
  '\t\t\tcontinue;',
  '\t\t}',
].join('\n');

function transformPromptContextLiteral(src, file) {
  if (src.includes(PROMPT_CONTEXT_LITERAL_MARKER)) return { status: 'already' };
  if (!src.includes(PROMPT_CONTEXT_LITERAL_ANCHOR)) {
    return { status: 'anchor-missing', detail: '未找到 dsh-system-prompt interpolate 抛错锚点（版本可能已变化），跳过 ' + file };
  }
  // 函数替换器：注入文本含 ${...} 模板字面量，规避 String.replace 对 $ 序列的替换语义。
  return { status: 'changed', src: src.replace(PROMPT_CONTEXT_LITERAL_ANCHOR, () => PROMPT_CONTEXT_LITERAL_INJECTION) };
}

// ---------------------------------------------------------------------------
// K1 根因修复（2026-08）：「credentials service is absent」偶发于桌面端。
//
// 根因链（字节级证据见 scripts/test/unit-fallback-heal-isolation.test.js）：
//   1. `$DSH_HOME/profiles/node_modules/@deepseek-ai/*` fallback junction 曾被
//      指向一个后来被删除的安装（活体现场：全部指向已不存在的
//      `%TEMP%\dsh-portable-sandbox\...`）；
//   2. `healProfilesModuleFallback`（dsh-app-boot）是「单点中断、整体放弃」：
//      写链接循环里任何一个名字抛错（Windows AV/EPERM 瞬时锁、真实目录占位、
//      双安装并发 heal 的 EEXIST 竞态）→ 整轮 heal 中止 → 半套 fallback 树
//      （受保护核心 dsh-base/dsh-web-app 恰在 BFS 序前段已写好，而
//      dsh-credentials-local 之类的宿主组合服务条目留在悬空/被占状态）；
//   3. loader-isolation 补丁把「非受保护条目导入/激活失败」静默降级为
//      stderr 标记 + 跳过 → boot 照常成功 → 用户直到在模型设置页保存
//      API key 才看到 apiproxy 的「credentials service is absent」。
// 网页端不共享 `%TEMP%`/双安装现场，故表现为「桌面端偶发」。
//
// 三层修复（均为幂等纯变换）：
//   a. fallback-heal-isolation（dsh-app-boot）：单个坏名字就地重试后跳过并打
//      `[fallback-heal] entry <name> failed: ...` 标记，其余名字照常 heal——
//      半套树窗口从「整轮放弃」缩小到「恰好那一个坏名字」；
//   b. credentials-initial-retry（dsh-credentials-local）：activate 首读的
//      stat/readFile 对 Windows 瞬时 EBUSY/EPERM/EACCES 重试 3 次（递增退避），
//      「AV 锁瞬时报错 → 激活失败 → 静默缺席」的触发面收窄；
//   c. credentials-absent-guidance（dsh-host-apiproxy）：报错文案追加修复指引，
//      即使降级态发生，用户看到的也是「重启一次自动修复」而不是死谜语。
// ---------------------------------------------------------------------------

// a. fallback heal 单点容错。
const FALLBACK_HEAL_ISOLATION_MARKER = 'dsh-desktop heal isolation: one stale fallback entry must not abort the whole heal';
// 0.1.2-alpha.1：fallback heal 循环从「`for (const [packageName, target] of links)`
// + 无条件 ensureSymlink」重构为「`for (const entry of entries)` + proxy/symlink
// 分派（entry.kind === "proxy" 走 ensureModuleProxy，否则 ensureSymlink）」。
const FALLBACK_HEAL_LOOP_OLD = [
  '\tfor (const entry of entries) {',
  '\t\tconst link = join(modulesDir, entry.packageName);',
  '\t\tmkdirSync(dirname(link), { recursive: true });',
  '\t\tif (entry.kind === "proxy") ensureModuleProxy(link, entry.packageName, entry.version, entry.targets);',
  '\t\telse ensureSymlink(link, entry.packageDir);',
  '\t}',
].join('\n');
const FALLBACK_HEAL_LOOP_NEW = [
  '\tfor (const entry of entries) {',
  '\t\tconst link = join(modulesDir, entry.packageName);',
  '\t\tmkdirSync(dirname(link), { recursive: true });',
  '\t\t// ' + FALLBACK_HEAL_ISOLATION_MARKER + ' (K1): a single bad entry must',
  '\t\t// not abort the whole heal — a half-healed fallback tree leaves host-',
  '\t\t// composition services (e.g. dsh-credentials-local) silently absent and',
  '\t\t// the user only finds out when saving an API key. Retry the move in',
  '\t\t// place (Windows AV/EPERM transients, concurrent-heal EEXIST races),',
  '\t\t// then isolate the one name and keep healing the rest.',
  '\t\ttry {',
  '\t\t\tif (entry.kind === "proxy") ensureModuleProxy(link, entry.packageName, entry.version, entry.targets);',
  '\t\t\telse ensureSymlink(link, entry.packageDir);',
  '\t\t} catch (healError) {',
  '\t\t\tlet healed = false;',
  '\t\t\tfor (let healRetry = 0; healRetry < 3; healRetry += 1) {',
  '\t\t\t\ttry {',
  '\t\t\t\t\tif (entry.kind === "proxy") ensureModuleProxy(link, entry.packageName, entry.version, entry.targets);',
  '\t\t\t\t\telse ensureSymlink(link, entry.packageDir);',
  '\t\t\t\t\thealed = true;',
  '\t\t\t\t\tbreak;',
  '\t\t\t\t} catch {}',
  '\t\t\t}',
  '\t\t\tif (!healed) process.stderr.write(`[fallback-heal] entry ${entry.packageName} failed: ${healError instanceof Error ? healError.message : String(healError)}\\n`);',
  '\t\t}',
  '\t}',
].join('\n');

function transformFallbackHealIsolation(src, file) {
  if (src.includes(FALLBACK_HEAL_ISOLATION_MARKER) && src.includes('[fallback-heal] entry ')) return { status: 'already' };
  if (!src.includes(FALLBACK_HEAL_LOOP_OLD)) {
    return { status: 'anchor-missing', detail: '未找到 fallback heal 写链接循环锚点（版本可能已变更），跳过 ' + file };
  }
  return { status: 'changed', src: src.replace(FALLBACK_HEAL_LOOP_OLD, FALLBACK_HEAL_LOOP_NEW) };
}

// b. credentials-local activate 首读的瞬时文件错误重试。
const CREDENTIALS_INITIAL_RETRY_MARKER = 'dsh-desktop compat: transient initial credentials read retries';
const CREDENTIALS_LOAD_INITIAL_OLD = [
  '\t\tlet text;',
  '\t\ttry {',
  '\t\t\ttext = await readFile(this.spec.filename, "utf8");',
  '\t\t} catch (error) {',
  '\t\t\tif (!isENOENT(error)) throw error;',
  '\t\t\treturn;',
  '\t\t}',
].join('\n');
const CREDENTIALS_LOAD_INITIAL_NEW = [
  '\t\tlet text;',
  '\t\ttry {',
  '\t\t\t// ' + CREDENTIALS_INITIAL_RETRY_MARKER + ' (K1): Windows AV/indexer can hold',
  '\t\t\t// the document through a transient EBUSY/EPERM/EACCES at exactly the boot read;',
  '\t\t\t// a failed activation silently drops the credentials service for the whole',
  '\t\t\t// session (loader isolation), so retry transient failures before giving up.',
  '\t\t\ttext = await readInitialDocumentWithRetry(this.spec.filename);',
  '\t\t} catch (error) {',
  '\t\t\tif (!isENOENT(error)) throw error;',
  '\t\t\treturn;',
  '\t\t}',
].join('\n');
const CREDENTIALS_OWNER_STAT_OLD = '\t\tmode = (await stat(filename)).mode;';
const CREDENTIALS_OWNER_STAT_NEW = '\t\tmode = (await statInitialWithRetry(filename)).mode;';
const CREDENTIALS_HELPERS_ANCHOR = [
  '/** Whether a filesystem error means absence; every non-ENOENT failure must surface. */',
  'function isENOENT(error) {',
  '\treturn error?.code === "ENOENT";',
  '}',
].join('\n');
const CREDENTIALS_HELPERS_CODE = [
  'async function statInitialWithRetry(filename) {',
  '\tfor (let attempt = 0; ; attempt += 1) {',
  '\t\ttry {',
  '\t\t\treturn await stat(filename);',
  '\t\t} catch (error) {',
  '\t\t\tif (attempt >= 2 || !isTransientInitialReadError(error)) throw error;',
  '\t\t\tawait new Promise((resolve) => setTimeout(resolve, 120 * (attempt + 1)));',
  '\t\t}',
  '\t}',
  '}',
  'async function readInitialDocumentWithRetry(filename) {',
  '\tfor (let attempt = 0; ; attempt += 1) {',
  '\t\ttry {',
  '\t\t\treturn await readFile(filename, "utf8");',
  '\t\t} catch (error) {',
  '\t\t\tif (attempt >= 2 || !isTransientInitialReadError(error)) throw error;',
  '\t\t\tawait new Promise((resolve) => setTimeout(resolve, 120 * (attempt + 1)));',
  '\t\t}',
  '\t}',
  '}',
  'function isTransientInitialReadError(error) {',
  '\treturn error?.code === "EBUSY" || error?.code === "EPERM" || error?.code === "EACCES";',
  '}',
].join('\n');

function transformCredentialsInitialRetry(src, file) {
  if (src.includes(CREDENTIALS_INITIAL_RETRY_MARKER) && src.includes('readInitialDocumentWithRetry')) return { status: 'already' };
  if (!src.includes(CREDENTIALS_LOAD_INITIAL_OLD) || !src.includes(CREDENTIALS_OWNER_STAT_OLD) || !src.includes(CREDENTIALS_HELPERS_ANCHOR)) {
    return { status: 'anchor-missing', detail: '未找到 credentials 首读锚点（版本可能已变更），跳过 ' + file };
  }
  let out = src.replace(CREDENTIALS_LOAD_INITIAL_OLD, CREDENTIALS_LOAD_INITIAL_NEW);
  out = out.replace(CREDENTIALS_OWNER_STAT_OLD, CREDENTIALS_OWNER_STAT_NEW);
  out = out.replace(CREDENTIALS_HELPERS_ANCHOR, CREDENTIALS_HELPERS_ANCHOR + '\n\n' + CREDENTIALS_HELPERS_CODE);
  return { status: 'changed', src: out };
}

// c. apiproxy「credentials service is absent」报错文案追加修复指引。
// 0.1.2-alpha.2：报错从 `message: "…",` 属性形态改为内联
// `throw new RemoteError("gateway/internal", "…", {});`（pristine
// dsh-api-settings-controller/lib/index.js provider() 实证），锚点与注入体同步
// 改用新形态；指引语义零变化（报错文案追加一步修复指引）。
const CREDENTIALS_ABSENT_GUIDANCE_MARKER = 'dsh-desktop compat: credentials-absent guidance';
const CREDENTIALS_ABSENT_OLD = '\t\t\tif (credentials === void 0) throw new RemoteError("gateway/internal", "credentials service is absent: this deployment does not mount a credential provider (e.g. @deepseek-ai/dsh-credentials-local) in its composition", {});';
const CREDENTIALS_ABSENT_NEW = [
  '\t\t\t// ' + CREDENTIALS_ABSENT_GUIDANCE_MARKER + ' (K1): the absent provider is almost always a',
  '\t\t\t// half-healed profile module fallback (`~/.dsh/profiles/node_modules`), not a',
  '\t\t\t// broken deployment — tell the user the one-step remedy instead of a riddle.',
  '\t\t\tif (credentials === void 0) throw new RemoteError("gateway/internal", "credentials service is absent: this deployment does not mount a credential provider (e.g. @deepseek-ai/dsh-credentials-local) in its composition — a required plugin failed to load this boot; restart DSH Desktop once to auto-repair the profile module fallback, then save the key again —— 请完全退出并重启 DSH Desktop 一次（启动链会自动修复），再重新保存密钥", {});',
].join('\n');

function transformCredentialsAbsentGuidance(src, file) {
  if (src.includes(CREDENTIALS_ABSENT_GUIDANCE_MARKER)) return { status: 'already' };
  if (!src.includes(CREDENTIALS_ABSENT_OLD)) {
    return { status: 'anchor-missing', detail: '未找到 credentialsAbsent 报错文案锚点（版本可能已变更），跳过 ' + file };
  }
  return { status: 'changed', src: src.replace(CREDENTIALS_ABSENT_OLD, CREDENTIALS_ABSENT_NEW) };
}

// ---------------------------------------------------------------------------
// 设备未授权指引（2026-08 用户实机反馈）：DeepSeek 服务端 403 风控原文
// 「This device is not authorized. Please contact the administrator or try
// again later.」经 dsh-llm-deepseek 透传，前端红框只显示这句英文死谜语——
// 用户既不知道是凭据/风控问题，也不知道该干什么（点「重试」无用、重装无用）。
// 本补丁在 401/403 且报文命中设备授权/风控特征时追加中文可操作指引。
// 一般性 401（密钥填错，已有 INVALID_CREDENTIAL 链路文案）不追加，防噪音。
// ---------------------------------------------------------------------------
const DEVICE_AUTH_GUIDANCE_MARKER = 'dsh-desktop compat: device-auth guidance';
// 双形态锚点（A1 验证：上游 rc.1 重构了非 2xx 块——3-tab + response.text() +
// JSON.parse；rc.8 及更早为 2-tab + response.json()。V2 优先，V1 兜底）。
const DEVICE_AUTH_THROW_ANCHOR_V2 = [
  '\t\t\tif (!response.ok) {',
  '\t\t\t\tlet message = `DeepSeek API error (HTTP ${response.status})`;',
  '\t\t\t\tlet providerError;',
  '\t\t\t\tconst rawResponse = await response.text();',
  '\t\t\t\ttry {',
  '\t\t\t\t\tproviderError = JSON.parse(rawResponse).error;',
  '\t\t\t\t\tif (providerError?.message) message = providerError.message;',
  '\t\t\t\t} catch {}',
].join('\n');
const DEVICE_AUTH_THROW_ANCHOR = [
  '\t\tif (!response.ok) {',
  '\t\t\tlet message = `DeepSeek API error (HTTP ${response.status})`;',
  '\t\t\tlet providerError;',
  '\t\t\ttry {',
  '\t\t\t\tproviderError = (await response.json()).error;',
  '\t\t\t\tif (providerError?.message) message = providerError.message;',
  '\t\t\t} catch {}',
].join('\n');
/** 指引注入体（indent = 抛错块 if 体的缩进层级；注释/if/message 行随层）。 */
function deviceAuthGuidanceBlock(indent) {
  const inner = indent + '\t';
  return [
    indent + '// ' + DEVICE_AUTH_GUIDANCE_MARKER + ': a provider-side device/risk-control',
    indent + '// rejection (e.g. "This device is not authorized. Please contact the',
    indent + '// administrator or try again later.") is a credential problem the client',
    indent + '// cannot retry or reinstall its way out of — append the actionable remedy',
    indent + '// so the user is not left with an English riddle.',
    indent + 'if ((response.status === 401 || response.status === 403) && /not authorized|\\u8bbe\\u5907\\u672a\\u6388\\u6743|contact the administrator|device.{0,24}(unauthorized|not allowed)/i.test(message)) {',
    inner + 'message += " ——【凭据被 DeepSeek 服务端拒绝（令牌失效或账号设备风控）】请到 chat.deepseek.com 重新登录获取新令牌，在 设置 → 模型 页重新填入 API 密钥后重试；重装客户端或反复点「重试」无效。";',
    indent + '}',
  ].join('\n');
}

function transformDeviceAuthGuidance(src, file) {
  if (src.includes(DEVICE_AUTH_GUIDANCE_MARKER)) return { status: 'already' };
  // rc.1/rc.2 形态（3-tab if 体 → 指引 4-tab 基准）。
  if (src.includes(DEVICE_AUTH_THROW_ANCHOR_V2)) {
    return { status: 'changed', src: src.replace(DEVICE_AUTH_THROW_ANCHOR_V2, () => DEVICE_AUTH_THROW_ANCHOR_V2 + '\n' + deviceAuthGuidanceBlock('\t\t\t\t')) };
  }
  // rc.8 及更早形态（2-tab if 体 → 指引 3-tab 基准）。
  if (src.includes(DEVICE_AUTH_THROW_ANCHOR)) {
    return { status: 'changed', src: src.replace(DEVICE_AUTH_THROW_ANCHOR, () => DEVICE_AUTH_THROW_ANCHOR + '\n' + deviceAuthGuidanceBlock('\t\t\t')) };
  }
  return { status: 'anchor-missing', detail: '未找到 dsh-llm-deepseek 非 2xx 抛错锚点（双形态 V2/V1 均未命中，版本可能已变更），跳过 ' + file };
}

// ---------------------------------------------------------------------------
// wsl-picker-browse 补丁（W1 问题四，2026-08）：目录选择器在 WSL 内误判 native。
//
// 根因（真实 WSL2 实机）：dsh-host-directory-picker-auto 的
// resolveDirectoryPickerBackend 在 platform=linux 且 DISPLAY 在场（WSLg 默认
// 设 DISPLAY=:0）且 PATH 上有 zenity/kdialog 时判 "native"——zenity 窗口弹在
// WSLg 的 Linux 桌面会话里，Windows 用户看不见，表现为「点选择目录没反应」。
//
// 修法：检测到 WSL 环境标记（WSL_INTEROP / WSL_DISTRO_NAME，WSL 内 Microsoft
// 注入、Linux 裸机不可能有）时强制返回 "browse"（网页内浏览交互，Windows
// 浏览器直接可见）。非 WSL 的 Linux 裸机行为不变（真在 Linux 桌面前的用户
// zenity 仍是最优交互）。
// 上游修复意向：上游 resolver 内置同款 WSL 判定后，本补丁经 already /
// anchor-missing 自然退役（参照 vision-key-fix 休眠先例）。
// ---------------------------------------------------------------------------
const WSL_PICKER_BROWSE_MARKER = 'dsh-desktop fix: WSL picker must browse, not zenity into WSLg';
// 锚点 = resolveDirectoryPickerBackend 的 SSH 分支行（该函数唯一出现处，
// dsh-host-directory-picker-auto lib/index.js:65 逐字抄录）。
const WSL_PICKER_ANCHOR = '\tif (present(facts.env.SSH_CONNECTION) || present(facts.env.SSH_TTY)) return "browse";';
const WSL_PICKER_INJECTION = [
  '\tif (present(facts.env.SSH_CONNECTION) || present(facts.env.SSH_TTY)) return "browse";',
  '\t// ' + WSL_PICKER_BROWSE_MARKER + ': under WSL (WSLg) DISPLAY=:0 is always set and',
  '\t// zenity/kdialog exist on PATH, so the resolver would mount the native backend —',
  '\t// but the chooser window opens in the Linux session desktop the Windows user',
  '\t// never sees. WSL_INTEROP/WSL_DISTRO_NAME are Microsoft-injected WSL markers',
  '\t// (never present on bare Linux), so force the web browse flow there.',
  '\tif (present(facts.env.WSL_INTEROP) || present(facts.env.WSL_DISTRO_NAME)) return "browse";',
].join('\n');

function transformDirectoryPickerWslBrowse(src, file) {
  if (src.includes(WSL_PICKER_BROWSE_MARKER)) return { status: 'already' };
  if (!src.includes(WSL_PICKER_ANCHOR)) {
    return { status: 'anchor-missing', detail: '未找到 directory-picker-auto SSH 分支锚点（版本可能已变化），跳过 ' + file };
  }
  return { status: 'changed', src: src.replace(WSL_PICKER_ANCHOR, () => WSL_PICKER_INJECTION) };
}

// ---------------------------------------------------------------------------
// api-gateway 缺席指引补丁（E1，2026-08 v0.5.2 用户反馈）：
// 「报错: 加载提供方目录失败: transport failure for /api/agentPreset.list:
//   HTTP 404，整个桌面端都没法用了」。
//
// 根因链（与 K1 credentials 缺席同族）：
//   1. `/api` 前缀路由由 dsh-client-connection 注册，其 fallback fetch 里
//      `if (apiProxy === void 0) return 404` —— api-gateway 插件
//      （@deepseek-ai/dsh-host-apiproxy，提供 ctx.apiProxy）一旦本 boot
//      加载/激活失败（半套 profile fallback 树 + loader-isolation 静默跳过
//      非保护核心，即 K1 的半树窗口恰好砸中网关本身），**所有** /api 方法
//      一律裸 404；
//   2. 前端每个面（模型设置页 llm.providers、预设 agentPreset.list、会话
//      session.list…）首载即炸，各面只显示「transport failure … HTTP 404」
//      英文死谜语，用户观感即「整个桌面端都没法用了」且无路可走。
//   注意：agentPresets 服务缺席 / 预设目录缺失都不产生 404——apiproxy 的
//   handler 在服务缺席时返回空目录 ok，scanRoot 对 ENOENT 返回 []；此 404
//   只能来自 apiProxy 服务整体缺席。
//
// 修法：缺席分支对 POST（unary 调用腿）改为回 200 + 错误信封——code 用
// "internal"（客户端 rpcErrorSchema 是闭合 discriminated union，新 code 会
// 在 client 侧 parse 失败换一种谜语），message 携带中英双语的一步修复指引
// （完全退出重启一次，boot 链会重 heal 模块回落树；不愈再重装）。rpcId 回
// 读请求体回显（客户端 callUnary 校验 echo）。非 POST 腿（SSE 打开器）保留
// 原 404，与其传输契约一致。上游内置同款缺席指引后本补丁经 already /
// anchor-missing 自然退役。
// ---------------------------------------------------------------------------
const API_GATEWAY_ABSENT_MARKER = 'dsh-desktop compat: api-gateway-absent';
// 锚点 = apply() fallback fetch 的 apiProxy 缺席三分支（payload rc.2 逐字节；
// 三行联合在文件内唯一，toFetchHandler(apiProxy) 全文件仅此一处）。
const API_GATEWAY_ABSENT_ANCHOR = [
  '\t\tconst apiProxy = ctx.get("apiProxy");',
  '\t\tif (apiProxy === void 0) return new Response("not found", { status: 404 });',
  '\t\treturn toFetchHandler(apiProxy).fetch(request);',
].join('\n');
const API_GATEWAY_ABSENT_INJECTION = [
  '\t\tconst apiProxy = ctx.get("apiProxy");',
  '\t\tif (apiProxy === void 0) {',
  '\t\t\t// ' + API_GATEWAY_ABSENT_MARKER + ' (E1): the api-gateway plugin',
  '\t\t\t// (@deepseek-ai/dsh-host-apiproxy) can fail to load on a half-healed',
  '\t\t\t// profile module fallback (the K1 family). The old bare 404 read as',
  '\t\t\t// "transport failure … HTTP 404" on EVERY surface at once with no way',
  '\t\t\t// forward. Unary POSTs now get a well-formed error envelope with the',
  '\t\t\t// one-step remedy instead; non-POST legs (SSE openers) keep the 404,',
  '\t\t\t// matching their transport contract.',
  '\t\t\tif (request.method !== "POST") return new Response("not found", { status: 404 });',
  '\t\t\tlet rpcId = INVALID_REQUEST_RPC_ID;',
  '\t\t\ttry {',
  '\t\t\t\tconst body = await request.json();',
  '\t\t\t\tif (typeof body?.rpcId === "string") rpcId = RpcId(body.rpcId);',
  '\t\t\t} catch {}',
  '\t\t\treturn errorResponse(rpcId, {',
  '\t\t\t\tcode: "internal",',
  '\t\t\t\tmessage: "api gateway service is absent: the API gateway plugin (@deepseek-ai/dsh-host-apiproxy) failed to load this boot, so every /api method answers with this error — fully exit and restart DSH Desktop once (the boot chain auto-repairs the profile module fallback), and reinstall only if it persists —— 桌面端后端服务（API 网关）本次启动未能加载，所有接口暂不可用：请完全退出并重启 DSH Desktop 一次（启动链会自动修复），若仍报此错请重装。",',
  '\t\t\t\tdetails: {}',
  '\t\t\t});',
  '\t\t}',
  '\t\treturn toFetchHandler(apiProxy).fetch(request);',
].join('\n');

function transformApiGatewayAbsent(src, file) {
  // CRLF 归一化匹配（对齐 loader-isolation 先例）；写回保持原 EOL。
  const crlf = src.includes('\r\n');
  const text = crlf ? src.replace(/\r\n/g, '\n') : src;
  // 幂等判定 = marker 存在 且 新形态注入体存在（仅 marker 残留的损坏文件必须重注入）。
  if (text.includes(API_GATEWAY_ABSENT_MARKER) && text.includes('code: "internal",') && text.includes('api gateway service is absent')) {
    return { status: 'already' };
  }
  if (!text.includes(API_GATEWAY_ABSENT_ANCHOR)) {
    return { status: 'anchor-missing', detail: '未找到 dsh-client-connection apiProxy 缺席分支锚点（版本可能已变更），跳过 ' + file };
  }
  // 函数替换器：注入文本含 ${...} 无，但保持与同族补丁一致的防御式替换语义。
  const out = text.replace(API_GATEWAY_ABSENT_ANCHOR, () => API_GATEWAY_ABSENT_INJECTION);
  return { status: 'changed', src: crlf ? out.replace(/\n/g, '\r\n') : out };
}

// ---------------------------------------------------------------------------
// 内核 web UI boot 看门狗（#154 第三根因）：client module system 不可达时
// 前端无限转圈。
//   · 形态：内核进程活着、HTTP 正常，但启动数据（__DSH_BOOT__ / client
//     module system / 插件 boot）一直不落定——前端 boot 页 spinner 无限转，
//     壳侧恢复页不会出现（内核进程没死，探活恒过）。
//   · 触发面：boot manifest 取回挂起、module bundle 加载失败、插件 fiber 永
//     不 settle（loader await 永不返回）。既有 fail-loud 只覆盖「内核自己
//     抓到错误」的分支；此处兜「什么都没发生」的静默挂起。
//   · 修法：在 dsh-web-frontend/dist/index.html 注入独立看门狗脚本（幂等），
//     45s 有界等待后若 boot 页仍停在 spinner（或模块 bundle 根本没加载），
//     用覆盖层给出明确错误 + 「重新加载」出口 + 完全退出重启指引——不再
//     无限转圈。boot 成功（卡片被真 UI 替换）或 fail-loud 已展示时不打扰。
//     纯 DOM 实现（零 React 依赖），页面/内核版本差异只影响锚点失配跳过。
// ---------------------------------------------------------------------------
const KERNEL_BOOT_WATCHDOG_MARKER = 'dsh-desktop compat: kernel web boot watchdog';
// 锚点 = index.html 的 mount 点（payload 与 pristine 均含；client-compat.js
// 注入差异不影响锚点）。注入在 mount 点之后、</body> 之前。
const KERNEL_BOOT_WATCHDOG_ANCHOR = '    <div id="root"></div>';
// 看门狗脚本（ES5；运行期文本中的换行经 \n 转义，构造为行数组保持可读）。
const KERNEL_BOOT_WATCHDOG_SCRIPT = [
  '  <script>',
  '  /* ' + KERNEL_BOOT_WATCHDOG_MARKER + '（#154）：boot 页有界等待，超时给出错误与恢复出口 */',
  '  (function () {',
  "    'use strict';",
  '    var START = Date.now();',
  '    var LIMIT_MS = 45000;',
  '    var POLL_MS = 2000;',
  '    function isStuck() {',
  "      var root = document.getElementById('root');",
  '      if (!root) return false;',
  "      var card = root.querySelector('[data-dsh-boot]');",
  '      if (card) {',
  '        // boot 页仍在：spinner = 卡死；fail-loud（_failed_ 节点）已展示 → 不打扰',
  "        return card.querySelector('[class*=\"_failed_\"]') === null;",
  '      }',
  '      // 卡片已被真 UI 替换或模块系统已就绪 → 完成；两者皆无 = 模块 bundle 根本没加载',
  '      return root.children.length === 0 && !window.__DSH_MODULES__;',
  '    }',
  '    function showRecovery() {',
  "      if (document.getElementById('dsh-boot-watchdog')) return;",
  "      var root = document.getElementById('root');",
  '      if (!root) return;',
  '      var panel = document.createElement("div");',
  "      panel.id = 'dsh-boot-watchdog';",
  "      panel.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:#0b1220;color:#d7dde4;font:14px/1.7 \"Segoe UI\",\"Microsoft YaHei\",sans-serif;text-align:center;padding:24px;';",
  '      var box = document.createElement("div");',
  '      var title = document.createElement("div");',
  "      title.style.cssText = 'font-size:18px;font-weight:600;margin-bottom:12px;';",
  "      title.textContent = '内核服务异常';",
  '      var msg = document.createElement("div");',
  "      msg.style.cssText = 'max-width:520px;margin:0 auto 16px;color:#9fb0c0;white-space:pre-wrap;';",
  "      msg.textContent = '启动数据（client module system）长时间不可达，页面已停止等待。\\n可点击下方「重新加载」重试；若反复出现，请完全退出并重启 DSH Desktop（启动链会自动修复）。';",
  '      var btns = document.createElement("div");',
  "      btns.style.cssText = 'display:flex;gap:12px;justify-content:center;';",
  '      var reload = document.createElement("button");',
  "      reload.textContent = '重新加载';",
  "      reload.style.cssText = 'padding:9px 22px;border-radius:8px;border:1px solid #32405280;background:#1a222c;color:#d7dde4;cursor:pointer;font-size:14px;';",
  "      reload.addEventListener('click', function () { location.reload(); });",
  '      btns.appendChild(reload);',
  '      box.appendChild(title); box.appendChild(msg); box.appendChild(btns);',
  '      panel.appendChild(box);',
  '      root.appendChild(panel);',
  '    }',
  '    function tick() {',
  '      if (!isStuck()) return;',
  '      if (Date.now() - START >= LIMIT_MS) { showRecovery(); return; }',
  '      setTimeout(tick, POLL_MS);',
  '    }',
  "    if (document.readyState === 'complete' || document.readyState === 'interactive') {",
  '      setTimeout(tick, 1000);',
  '    } else {',
  "      window.addEventListener('DOMContentLoaded', function () { setTimeout(tick, 1000); });",
  '    }',
  '  })();',
  '  </script>',
].join('\n');

/**
 * 内核 web UI boot 看门狗（#154 第三根因）：index.html 注入有界等待看门狗。
 * 幂等（marker + 注入体双重判定）；锚点失配（版本差异）跳过不阻断。
 */
function transformKernelBootWatchdog(src, file) {
  const crlf = src.includes('\r\n');
  const text = crlf ? src.replace(/\r\n/g, '\n') : src;
  if (text.includes(KERNEL_BOOT_WATCHDOG_MARKER) && text.includes("dsh-boot-watchdog")) {
    return { status: 'already' };
  }
  if (!text.includes(KERNEL_BOOT_WATCHDOG_ANCHOR)) {
    return { status: 'anchor-missing', detail: '未找到内核 web UI index.html mount 点锚点（版本可能已变更），跳过 ' + file };
  }
  const out = text.replace(
    KERNEL_BOOT_WATCHDOG_ANCHOR,
    KERNEL_BOOT_WATCHDOG_ANCHOR + '\n' + KERNEL_BOOT_WATCHDOG_SCRIPT,
  );
  return { status: 'changed', src: crlf ? out.replace(/\n/g, '\r\n') : out };
}

// ---------------------------------------------------------------------------
// adapter prepareCall 守卫（R7，2026-08 v0.5.3 用户反馈）：
// 「registration.adapter.prepareCall is not a function」——v0.5.3 内核升级到
// 0.1.1-rc.2 后 LlmRuntime.prepareCall（dsh-llm/lib/index.js:1498）开始调用
// adapter.prepareCall（新增契约：基类 LlmAdapter 补上默认 prepareCall，内置
// DeepSeekAdapter / PiAiAdapter 自带实现，不受影响）；而内置唯一「不自带
// prepareCall」的自定义 provider 适配器 dsh-openclaw-bridge 的
// OpenAiCompatAdapter 只 `extends LlmAdapter`、依赖基类 prepareCall——一旦它
// 经 profile fallback junction 解析到旧内核（0.1.0-rc.7/8，基类无 prepareCall），
// registration.adapter.prepareCall 即为 undefined → 对话整轮炸。同一文件两处
// 调用点（prepareCall 主路径 + adapterStream 直连路径）同源同险。
//
// 修法：在 LlmRuntime 注入 prepareAdapterCall 守卫——adapter.prepareCall 缺失
// 时回落基类语义（resolveModel + stream）并 console.warn 升级指引，不裸抛
// 「is not a function」。幂等 marker + 方法注入点 + 双调用点三锚点校验。
// 上游修复意向：上游为内置/自定义适配器统一稳定 prepareCall 契约后，本补丁
// 经 already / anchor-missing 自然退役。
// ---------------------------------------------------------------------------
const ADAPTER_PREPARE_CALL_GUARD_MARKER = 'dsh-desktop fix: adapter prepareCall guard';
const ADAPTER_PREPARE_CALL_ANCHOR_PREPARED = '\t\tconst adapterCall = await registration.adapter.prepareCall(config.provider, config.model, signal);';
const ADAPTER_PREPARE_CALL_ANCHOR_DIRECT = '\t\t\t\tconst adapterCall = await adapter.prepareCall(options.provider, options.model, options.signal);';
// 注入点 = registration(provider) 方法签名（prepareCall 结束之后，避免把
// prepareCall 的 JSDoc 注释错挂到注入方法上）。
const ADAPTER_PREPARE_CALL_METHOD_ANCHOR = '\tregistration(provider) {';
const ADAPTER_PREPARE_CALL_METHOD_INJECTION = [
  '\t/**',
  '\t* ' + ADAPTER_PREPARE_CALL_GUARD_MARKER + ' — a custom-provider adapter built',
  '\t* against a pre-rc.2 kernel (the base LlmAdapter had no prepareCall) can be',
  '\t* missing prepareCall entirely. Fall back to the base semantics so the call',
  '\t* still works, and warn the user that the kernel needs an upgrade/reinstall.',
  '\t*/',
  '\tasync prepareAdapterCall(adapter, provider, model, signal) {',
  '\t\tif (typeof adapter.prepareCall === "function") {',
  '\t\t\treturn adapter.prepareCall(provider, model, signal);',
  '\t\t}',
  "\t\tconsole.warn('[dsh] LLM adapter for provider ' + provider + ' is missing prepareCall (built against an older kernel); falling back to base LlmAdapter.prepareCall semantics. Upgrade or reinstall the kernel to clear this warning.');",
  '\t\treturn {',
  '\t\t\tmodel: await adapter.resolveModel(provider, model, signal),',
  '\t\t\tstream: (options) => adapter.stream(options)',
  '\t\t};',
  '\t}',
  ADAPTER_PREPARE_CALL_METHOD_ANCHOR,
].join('\n');

function transformAdapterPrepareCallGuard(src, file) {
  if (src.includes(ADAPTER_PREPARE_CALL_GUARD_MARKER)) return { status: 'already' };
  // 方法注入点 + 双调用点三者缺一即版本漂移，按失配跳过（不冒险半补）。
  if (!src.includes(ADAPTER_PREPARE_CALL_METHOD_ANCHOR)
    || !src.includes(ADAPTER_PREPARE_CALL_ANCHOR_PREPARED)
    || !src.includes(ADAPTER_PREPARE_CALL_ANCHOR_DIRECT)) {
    return { status: 'anchor-missing', detail: '未找到 dsh-llm prepareCall 调用点/方法注入锚点（版本可能已变更），跳过 ' + file };
  }
  let out = src;
  out = out.replace(ADAPTER_PREPARE_CALL_METHOD_ANCHOR, ADAPTER_PREPARE_CALL_METHOD_INJECTION);
  out = out.replace(ADAPTER_PREPARE_CALL_ANCHOR_PREPARED, '\t\tconst adapterCall = await this.prepareAdapterCall(registration.adapter, config.provider, config.model, signal);');
  out = out.replace(ADAPTER_PREPARE_CALL_ANCHOR_DIRECT, '\t\t\t\tconst adapterCall = await this.prepareAdapterCall(adapter, options.provider, options.model, options.signal);');
  return { status: 'changed', src: out };
}

// 会话事件有界保留（K4：v0.5.4 多子代理渲染进程 OOM 根治）。内核
// Session.events / ConversationNodeAssembler.inputs 无上限累积，多 Session 的
// 流式事件线性堆积吃光 WebView2 渲染进程内存。保守两步根治（不砍结构性事件，
// rewind/compaction/replay 语义不回归）：
//   1) appendLive 追加后 trimSessionWindow()：events 超 SESSION_EVENT_BOUND 时按
//      turn/start 对齐裁掉最旧切片并 flip hasMore，loadOlder 仍可按需回翻（host
//      会话日志是持久真相，客户端窗口只是镜像）；
//   2) dispose() 实装 + drop() 调用：会话被 prune/drop 时清空 events/views/
//      conversation 派生态，解决「切会话/删会话后仍常驻」。
const SESSION_EVENT_BOUND_MARKER = 'dsh-desktop compat: bounded session event retention';

const SESSION_EVENT_BOUND_CONSTANTS_OLD = '\t\tvar Session = class {';
const SESSION_EVENT_BOUND_CONSTANTS_NEW = [
  '\t\t/** ' + SESSION_EVENT_BOUND_MARKER + ' — hard cap on the in-memory raw window;',
  '\t\t * trimSessionWindow drops the oldest slice once the bound is exceeded',
  '\t\t * (turn/start-aligned), retaining SESSION_EVENT_KEEP. */',
  '\t\tconst SESSION_EVENT_BOUND = 2000;',
  '\t\tconst SESSION_EVENT_KEEP = 1200;',
  '\t\t// ' + SESSION_EVENT_BOUND_MARKER + ' (v4): after a loadOlder page, keep the expanded',
  '\t\t// window stable up to trimSuppressedFloor + this margin before re-trimming, so',
  '\t\t// streaming appends do not immediately drop the freshly paged history.',
  '\t\tconst SESSION_EVENT_SUPPRESS_MARGIN = 20000;',
  '\t\tvar Session = class {',
].join('\n');

const SESSION_EVENT_BOUND_DISPOSE_OLD = '\t\t\tdispose() {}';
const SESSION_EVENT_BOUND_DISPOSE_NEW = [
  '\t\t\tdispose() {',
  '\t\t\t\tif (this.disposed === true) return;',
  '\t\t\t\tthis.disposed = true;',
  '\t\t\t\t// ' + SESSION_EVENT_BOUND_MARKER + ': release retained event/derived state so a dropped',
  '\t\t\t\t// resident session stops holding its renderer memory (host log is durable',
  '\t\t\t\t// truth; a later get() lazily rebuilds and open() backfills).',
  '\t\t\t\tthis.events = [];',
  '\t\t\t\tthis.views = [];',
  '\t\t\t\tthis.baseSeq = 0;',
  '\t\t\t\tthis.hasMore = false;',
  '\t\t\t\tthis.trimSuppressed = false;',
  '\t\t\t\tthis.trimSuppressedFloor = 0;',
  '\t\t\t\tthis.liveBuffer = [];',
  '\t\t\t\tthis.subscribedLastSeq = null;',
  '\t\t\t\tthis.openGeneration++;',
  '\t\t\t\tthis.pending.clear();',
  '\t\t\t\tthis.pendingRev++;',
  '\t\t\t\tthis.pendingCache = null;',
  '\t\t\t\tthis.queueMirror.reset();',
  '\t\t\t\tthis.conversation.replaceWindow([], false);',
  '\t\t\t\tthis.notifier.markDirty();',
  '\t\t\t}',
].join('\n');

const SESSION_EVENT_BOUND_DROP_OLD = ['\t\t\tdrop(sessionId) {', '\t\t\t\tthis.sessions.delete(sessionId);', '\t\t\t}'].join('\n');
const SESSION_EVENT_BOUND_DROP_NEW = [
  '\t\t\tdrop(sessionId) {',
  '\t\t\t\tconst session = this.sessions.get(sessionId);',
  '\t\t\t\tif (session !== void 0) session.dispose();',
  '\t\t\t\tthis.sessions.delete(sessionId);',
  '\t\t\t}',
].join('\n');

const SESSION_EVENT_BOUND_APPENDLIVE_OLD = '\t\t\t\treturn queueChanged ? "immediate" : publication;\n\t\t\t}';
const SESSION_EVENT_BOUND_APPENDLIVE_NEW = [
  '\t\t\t\t// ' + SESSION_EVENT_BOUND_MARKER + '.',
  '\t\t\t\tthis.trimSessionWindow();',
  '\t\t\t\treturn queueChanged ? "immediate" : publication;',
  '\t\t\t}',
  '',
  '\t\t\t/**',
  '\t\t\t* ' + SESSION_EVENT_BOUND_MARKER + ' — keep the in-memory raw window (and the derived',
  '\t\t\t* Conversation state) bounded so long-lived multi-subagent streams cannot',
  '\t\t\t* grow the renderer without limit. The host session log stays the durable',
  '\t\t\t* truth: trimming only drops the oldest retained slice and flips hasMore so',
  '\t\t\t* loadOlder() can page it back on demand. The cut aligns to the nearest',
  '\t\t\t* turn/start boundary to avoid a half-trimmed turn at the window head.',
  '\t\t\t*/',
  '\t\t\ttrimSessionWindow() {',
  '\t\t\t\t// ' + SESSION_EVENT_BOUND_MARKER + ' (v4): never trim while a loadOlder page is in',
  '\t\t\t\t// flight — the request is keyed to the current baseSeq, and moving it would make',
  '\t\t\t\t// the returned page discontinuous (whole page discarded).',
  '\t\t\t\tif (this.loadingOlder) return;',
  '\t\t\t\t// ' + SESSION_EVENT_BOUND_MARKER + ' (v4): after a successful loadOlder, keep the',
  '\t\t\t\t// expanded window stable up to trimSuppressedFloor + SESSION_EVENT_SUPPRESS_MARGIN',
  '\t\t\t\t// so streaming appends don\'t immediately drop the freshly paged history.',
  '\t\t\t\tif (this.trimSuppressed === true) {',
  '\t\t\t\t\tif (this.events.length <= (this.trimSuppressedFloor ?? 0) + SESSION_EVENT_SUPPRESS_MARGIN) return;',
  '\t\t\t\t\tthis.trimSuppressed = false;',
  '\t\t\t\t\tthis.trimSuppressedFloor = 0;',
  '\t\t\t\t}',
  '\t\t\t\tif (this.events.length <= SESSION_EVENT_BOUND) return;',
  '\t\t\t\tlet cut = this.events.length - SESSION_EVENT_KEEP;',
  '\t\t\t\tfor (let index = cut; index < this.events.length; index++) {',
  '\t\t\t\t\tconst candidate = this.events[index];',
  '\t\t\t\t\tif (candidate !== void 0 && candidate.type === "turn/start") {',
  '\t\t\t\t\t\tcut = index;',
  '\t\t\t\t\t\tbreak;',
  '\t\t\t\t\t}',
  '\t\t\t\t}',
  '\t\t\t\tif (cut <= 0) return;',
  '\t\t\t\tthis.events = this.events.slice(cut);',
  '\t\t\t\tthis.views = this.views.slice(cut);',
  '\t\t\t\tthis.baseSeq = this.events[0]?.seq ?? 0;',
  '\t\t\t\tthis.hasMore = true;',
  '\t\t\t\tthis.conversation.replaceWindow(this.events.map((event, index) => ({',
  '\t\t\t\t\tevent,',
  '\t\t\t\t\tview: this.views[index]',
  '\t\t\t\t})), true);',
  '\t\t\t\tthis.notifier.markDirty();',
  '\t\t\t}',
].join('\n');

// v4 接缝：loadOlder 成功页写入点（去重 + 抑制后续 trim）。锚点是
// loadOlder 里「拼接 older 到 events/views + 更新 baseSeq/hasMore + prepend」
// 的整块（5 tab 缩进），随上游缩进/变量名漂移即 anchor-missing 退役。
const SESSION_EVENT_BOUND_LOADOLDER_OLD = [
  '\t\t\t\t\tthis.events = [...older.map((e) => e.event), ...this.events];',
  '\t\t\t\t\tthis.views = [...older.map((e) => e.view), ...this.views];',
  '\t\t\t\t\t/* v8 ignore next -- the ?? arm needs older[0] undefined, but the empty-page branch above already returned. */',
  '\t\t\t\t\tthis.baseSeq = older[0]?.event.seq ?? this.baseSeq;',
  '\t\t\t\t\tthis.hasMore = result.value.hasMore;',
  '\t\t\t\t\tthis.conversation.prepend(older.map(conversationInput), this.hasMore);',
].join('\n');
const SESSION_EVENT_BOUND_LOADOLDER_NEW = [
  '\t\t\t\t\t// ' + SESSION_EVENT_BOUND_MARKER + ' (v4): dedup the paged batch against the window',
  '\t\t\t\t\t// so a trim/loadOlder seam can never double-count a boundary event (e.g. a',
  '\t\t\t\t\t// tool/call start → "more than one start Match").',
  '\t\t\t\t\tconst retainedSeqs = new Set(this.events.map((event) => event.seq));',
  '\t\t\t\t\tconst freshOlder = older.filter((entry) => !retainedSeqs.has(entry.event.seq));',
  '\t\t\t\t\tthis.events = [...freshOlder.map((e) => e.event), ...this.events];',
  '\t\t\t\t\tthis.views = [...freshOlder.map((e) => e.view), ...this.views];',
  '\t\t\t\t\t/* v8 ignore next -- the ?? arm needs older[0] undefined, but the empty-page branch above already returned. */',
  '\t\t\t\t\tthis.baseSeq = freshOlder[0]?.event.seq ?? this.baseSeq;',
  '\t\t\t\t\tthis.hasMore = result.value.hasMore;',
  '\t\t\t\t\tthis.conversation.prepend(freshOlder.map(conversationInput), this.hasMore);',
  '\t\t\t\t\t// ' + SESSION_EVENT_BOUND_MARKER + ' (v4): suppress re-trim after a successful',
  '\t\t\t\t\t// loadOlder so the freshly paged history stays visible while streaming',
  '\t\t\t\t\t// continues; trimSessionWindow only re-trims past floor + margin.',
  '\t\t\t\t\tthis.trimSuppressed = true;',
  '\t\t\t\t\tthis.trimSuppressedFloor = this.events.length;',
].join('\n');

// K22 滚动回底修复：trim 只在 turn 边界（running=false）裁窗。流式期间
// （running=true）用户常已上滚读更早历史，此时 trim → replaceWindow 重建会触发
// UI 的 follow/自动滚底（followSig 因 firstSeq/order.length 变化而 tipMoved）+ 内容
// 收缩把 scrollTop 钳到新底，把用户从顶部拉回底部。改为：流式期间仅在超过
// SESSION_EVENT_RUNNING_HARD_CAP 的紧急上限才裁（OOM 兜底），否则推迟到 turn
// 边界由下一次 append（running=false）照常裁回 SESSION_EVENT_KEEP。
const SESSION_EVENT_RUNNING_CAP_ANCHOR = '\t\tconst SESSION_EVENT_BOUND = 2000;';
const SESSION_EVENT_RUNNING_CAP_INJECTION = [
  '\t\tconst SESSION_EVENT_BOUND = 2000;',
  '\t\t// ' + SESSION_EVENT_BOUND_MARKER + ' (K22): hard cap while a turn is actively streaming.',
  '\t\tconst SESSION_EVENT_RUNNING_HARD_CAP = 6000;',
].join('\n');

const SESSION_EVENT_RUNNING_GUARD_ANCHOR = '\t\t\t\tif (this.events.length <= SESSION_EVENT_BOUND) return;';
const SESSION_EVENT_RUNNING_GUARD_INJECTION = [
  '\t\t\t\tif (this.events.length <= SESSION_EVENT_BOUND) return;',
  '\t\t\t\t// ' + SESSION_EVENT_BOUND_MARKER + ' (K22): do not trim while a turn is streaming —',
  '\t\t\t\t// the reader may have scrolled up to the window head, and replaceWindow would',
  '\t\t\t\t// snap them back to the bottom. Defer to the turn boundary (running === false),',
  '\t\t\t\t// keeping only the emergency hard cap so a pathological single turn cannot OOM.',
  '\t\t\t\tif (this.running === true && this.events.length <= SESSION_EVENT_RUNNING_HARD_CAP) return;',
].join('\n');

function transformSessionEventBound(src, file) {
  if (src.includes(SESSION_EVENT_BOUND_MARKER)) return { status: 'already' };
  const anchors = [SESSION_EVENT_BOUND_CONSTANTS_OLD, SESSION_EVENT_BOUND_DISPOSE_OLD, SESSION_EVENT_BOUND_DROP_OLD, SESSION_EVENT_BOUND_APPENDLIVE_OLD, SESSION_EVENT_BOUND_LOADOLDER_OLD];
  const missing = anchors.filter((anchor) => !src.includes(anchor));
  if (missing.length > 0) {
    return { status: 'anchor-missing', detail: '未找到 Session events 有界保留锚点（版本可能已变更），跳过 ' + file };
  }
  let out = src;
  out = out.replace(SESSION_EVENT_BOUND_CONSTANTS_OLD, SESSION_EVENT_BOUND_CONSTANTS_NEW);
  out = out.replace(SESSION_EVENT_BOUND_DISPOSE_OLD, SESSION_EVENT_BOUND_DISPOSE_NEW);
  out = out.replace(SESSION_EVENT_BOUND_DROP_OLD, SESSION_EVENT_BOUND_DROP_NEW);
  out = out.replace(SESSION_EVENT_BOUND_APPENDLIVE_OLD, SESSION_EVENT_BOUND_APPENDLIVE_NEW);
  out = out.replace(SESSION_EVENT_BOUND_LOADOLDER_OLD, SESSION_EVENT_BOUND_LOADOLDER_NEW);
  // K22：流式期间暂缓 trim（running 门控 + 紧急硬上限），避免 replaceWindow 重建把上滚读者拉回底部。
  out = out.replace(SESSION_EVENT_RUNNING_CAP_ANCHOR, SESSION_EVENT_RUNNING_CAP_INJECTION);
  out = out.replace(SESSION_EVENT_RUNNING_GUARD_ANCHOR, SESSION_EVENT_RUNNING_GUARD_INJECTION);
  return { status: 'changed', src: out };
}

// ---------------------------------------------------------------------------
// 一键加载全部历史（K24）：长会话不用反复点「加载更早」（每次 50 条，20 万事件
// 会话要点几十次）。给内核 Session 加 loadAllHistory()：按 400 条/批循环
// history({beforeSeq, maxMessages}) 拉取，每批 prepend 后 await 让出一帧并更新
// 进度，10000 条保护上限防超大会话把渲染进程打爆；再次点击 / 新会话可经
// cancelLoadAllHistory() 中断。复用 loadOlder 的去重 + baseSeq + hasMore + trim
// 抑制语义（与 K8 bounded-retention 组合，不破坏 loadOlder/trim/流式）。
// 目标：dsh-client-runtime/lib/client.js（FLASH_PKG_REL）。锚点独立于 K8。
// ---------------------------------------------------------------------------
const LOAD_ALL_HISTORY_MARKER = 'dsh-desktop compat: load-all-history';

const LOAD_ALL_HISTORY_INSERT_ANCHOR = [
  '\t\t\t\t} finally {',
  '\t\t\t\t\tthis.loadingOlder = false;',
  '\t\t\t\t\tthis.notifier.markDirty();',
  '\t\t\t\t}',
  '\t\t\t}',
  '\t\t\t/** Reconnect rebuild (manager calls this on onConnected for instances that were opened):',
].join('\n');

const LOAD_ALL_HISTORY_METHODS = [
  '\t\t\t/** One-click batch loader: pull the entire remaining history in bounded batches,',
  '\t\t\t*  yielding a frame between batches, with a hard message cap and a cancel token.',
  '\t\t\t*  Reuses loadOlder\'s page-application semantics (seq dedup + baseSeq + hasMore +',
  '\t\t\t*  trim suppression) so it composes with the bounded-retention trim. */',
  '\t\t\tasync loadAllHistory() {',
  '\t\t\t\t// ' + LOAD_ALL_HISTORY_MARKER + ' — re-entry + concurrency guards.',
  '\t\t\t\tif (this.openState !== "open" || !this.hasMore || this.loadingAllHistory === true || this.loadingOlder === true) return;',
  '\t\t\t\tthis.loadingAllHistory = true;',
  '\t\t\t\tthis.loadingOlder = true;',
  '\t\t\t\tthis.loadAllLoaded = 0;',
  '\t\t\t\tthis.loadAllLimitReached = false;',
  '\t\t\t\tthis.loadAllCancelled = false;',
  '\t\t\t\tconst token = this.loadAllToken = (this.loadAllToken ?? 0) + 1;',
  '\t\t\t\tconst generation = this.openGeneration;',
  '\t\t\t\tconst BATCH = 400;',
  '\t\t\t\tconst LIMIT = 10000;',
  '\t\t\t\tthis.notifier.markDirty();',
  '\t\t\t\ttry {',
  '\t\t\t\t\twhile (this.loadAllToken === token && !this.loadAllCancelled && this.openGeneration === generation && this.openState === "open" && this.hasMore && this.loadAllLoaded < LIMIT) {',
  '\t\t\t\t\t\tconst { result } = await this.history({ beforeSeq: this.baseSeq, maxMessages: BATCH });',
  '\t\t\t\t\t\tif (this.loadAllToken !== token || this.openGeneration !== generation) break;',
  '\t\t\t\t\t\tif (!result.ok) break;',
  '\t\t\t\t\t\tconst older = result.value.events;',
  '\t\t\t\t\t\tif (older.length === 0) {',
  '\t\t\t\t\t\t\tthis.hasMore = result.value.hasMore;',
  '\t\t\t\t\t\t\tthis.conversation.prepend([], this.hasMore);',
  '\t\t\t\t\t\t\tbreak;',
  '\t\t\t\t\t\t}',
  '\t\t\t\t\t\tconst tail = older[older.length - 1];',
  '\t\t\t\t\t\tif (tail === void 0 || tail.event.seq + 1 !== this.baseSeq) {',
  '\t\t\t\t\t\t\tconsole.error(`[web-runtime] loadAllHistory discontinuous: tail seq ${tail?.event.seq} vs baseSeq ${this.baseSeq}`);',
  '\t\t\t\t\t\t\tthis.hasMore = false;',
  '\t\t\t\t\t\t\tthis.conversation.prepend([], false);',
  '\t\t\t\t\t\t\tbreak;',
  '\t\t\t\t\t\t}',
  '\t\t\t\t\t\t// ' + LOAD_ALL_HISTORY_MARKER + ' — dedup the paged batch against the window',
  '\t\t\t\t\t\t// (same seam guard as loadOlder) so a trim boundary never double-counts an event.',
  '\t\t\t\t\t\tconst retainedSeqs = new Set(this.events.map((event) => event.seq));',
  '\t\t\t\t\t\tconst freshOlder = older.filter((entry) => !retainedSeqs.has(entry.event.seq));',
  '\t\t\t\t\t\tthis.events = [...freshOlder.map((e) => e.event), ...this.events];',
  '\t\t\t\t\t\tthis.views = [...freshOlder.map((e) => e.view), ...this.views];',
  '\t\t\t\t\t\tthis.baseSeq = freshOlder[0]?.event.seq ?? this.baseSeq;',
  '\t\t\t\t\t\tthis.hasMore = result.value.hasMore;',
  '\t\t\t\t\t\tthis.conversation.prepend(freshOlder.map(conversationInput), this.hasMore);',
  '\t\t\t\t\t\tthis.trimSuppressed = true;',
  '\t\t\t\t\t\tthis.trimSuppressedFloor = this.events.length;',
  '\t\t\t\t\t\tthis.loadAllLoaded += freshOlder.length;',
  '\t\t\t\t\t\tthis.notifier.markDirty();',
  '\t\t\t\t\t\t// yield a frame so the prepend and the progress counter actually paint.',
  '\t\t\t\t\t\tawait new Promise((resolve) => {',
  '\t\t\t\t\t\t\tif (typeof requestAnimationFrame === "function") requestAnimationFrame(resolve);',
  '\t\t\t\t\t\t\telse setTimeout(resolve, 0);',
  '\t\t\t\t\t\t});',
  '\t\t\t\t\t}',
  '\t\t\t\t\tif (this.loadAllToken === token && this.hasMore && this.loadAllLoaded >= LIMIT) {',
  '\t\t\t\t\t\tthis.loadAllLimitReached = true;',
  '\t\t\t\t\t\tthis.notifier.markDirty();',
  '\t\t\t\t\t}',
  '\t\t\t\t} catch (error) {',
  '\t\t\t\t\tconsole.error("[web-runtime] loadAllHistory failed:", error);',
  '\t\t\t\t} finally {',
  '\t\t\t\t\tthis.loadingAllHistory = false;',
  '\t\t\t\t\tthis.loadingOlder = false;',
  '\t\t\t\t\tthis.notifier.markDirty();',
  '\t\t\t\t}',
  '\t\t\t}',
  '\t\t\t/** Cancel an in-flight load-all-history run (re-click or session switch). */',
  '\t\t\tcancelLoadAllHistory() {',
  '\t\t\t\tthis.loadAllCancelled = true;',
  '\t\t\t\tthis.loadAllToken = (this.loadAllToken ?? 0) + 1;',
  '\t\t\t}',
];

const LOAD_ALL_HISTORY_INSERT_REPLACEMENT = [
  '\t\t\t\t} finally {',
  '\t\t\t\t\tthis.loadingOlder = false;',
  '\t\t\t\t\tthis.notifier.markDirty();',
  '\t\t\t\t}',
  '\t\t\t}',
  ...LOAD_ALL_HISTORY_METHODS,
  '\t\t\t/** Reconnect rebuild (manager calls this on onConnected for instances that were opened):',
].join('\n');

const LOAD_ALL_HISTORY_SNAPSHOT_ANCHOR = '\t\t\t\t\tloadingOlder: this.loadingOlder,';
const LOAD_ALL_HISTORY_SNAPSHOT_REPLACEMENT = [
  '\t\t\t\t\tloadingOlder: this.loadingOlder,',
  '\t\t\t\t\tloadingAllHistory: this.loadingAllHistory,',
  '\t\t\t\t\tloadAllLoaded: this.loadAllLoaded,',
  '\t\t\t\t\tloadAllLimitReached: this.loadAllLimitReached,',
].join('\n');

function transformLoadAllHistory(src, file) {
  if (src.includes(LOAD_ALL_HISTORY_MARKER)) return { status: 'already' };
  const missing = [];
  if (!src.includes(LOAD_ALL_HISTORY_INSERT_ANCHOR)) missing.push('loadOlder finally/Reconnect anchor');
  if (!src.includes(LOAD_ALL_HISTORY_SNAPSHOT_ANCHOR)) missing.push('buildSnapshot loadingOlder anchor');
  if (missing.length > 0) {
    return { status: 'anchor-missing', detail: '未找到 load-all-history 锚点（版本可能已变更）：' + missing.join(' / ') + '，跳过 ' + file };
  }
  let out = src;
  out = out.replace(LOAD_ALL_HISTORY_INSERT_ANCHOR, LOAD_ALL_HISTORY_INSERT_REPLACEMENT);
  out = out.replace(LOAD_ALL_HISTORY_SNAPSHOT_ANCHOR, LOAD_ALL_HISTORY_SNAPSHOT_REPLACEMENT);
  return { status: 'changed', src: out };
}

// ---------------------------------------------------------------------------
// 一键加载全部历史 —— UI 侧（K24）：在「加载更早」旁加「加载全部历史」按钮 +
// 进度/停止/达上限提示。只追加新块、不动 K22 排查中的自动滚底 / loadOlder 锚点
// 逻辑。目标：dsh-client-ui-conversation/lib/client.js（CONVERSATION_PKG_REL）。
// ---------------------------------------------------------------------------
const LOAD_ALL_HISTORY_UI_MARKER = 'dsh-desktop compat: load-all-history button';

const LOAD_ALL_HISTORY_UI_CTRL_ANCHOR = [
  '\t\t\t/** Pull one older history page for the scoped Session. */',
  '\t\t\tasync loadOlder() {',
  '\t\t\t\tawait this.scopedSession("loadOlder").loadOlder();',
  '\t\t\t}',
].join('\n');
const LOAD_ALL_HISTORY_UI_CTRL_REPLACEMENT = [
  '\t\t\t/** Pull one older history page for the scoped Session. */',
  '\t\t\tasync loadOlder() {',
  '\t\t\t\tawait this.scopedSession("loadOlder").loadOlder();',
  '\t\t\t}',
  '\t\t\t/** ' + LOAD_ALL_HISTORY_UI_MARKER + ' — one-click batch load of the entire remaining history. */',
  '\t\t\tasync loadAllHistory() {',
  '\t\t\t\tawait this.scopedSession("loadAllHistory").loadAllHistory();',
  '\t\t\t}',
  '\t\t\t/** ' + LOAD_ALL_HISTORY_UI_MARKER + ' — cancel an in-flight batch load. */',
  '\t\t\tasync cancelLoadAllHistory() {',
  '\t\t\t\tawait this.scopedSession("loadAllHistory").cancelLoadAllHistory();',
  '\t\t\t}',
].join('\n');

const LOAD_ALL_HISTORY_UI_SIGNATURE_OLD = '\t\tfunction ChatView({ useSession, useSessions, useStore, renderSlot, sessionId, openFile, loadOlder, loadImage, inspectCall, chatScroll, forkAt, fileMentions, t }) {';
const LOAD_ALL_HISTORY_UI_SIGNATURE_NEW = '\t\tfunction ChatView({ useSession, useSessions, useStore, renderSlot, sessionId, openFile, loadOlder, loadAllHistory, cancelLoadAllHistory, loadImage, inspectCall, chatScroll, forkAt, fileMentions, t }) {';

const LOAD_ALL_HISTORY_UI_STATE_ANCHOR = '\t\t\tconst loadingOlder = useSession((s) => s.loadingOlder);';
const LOAD_ALL_HISTORY_UI_STATE_REPLACEMENT = [
  '\t\t\tconst loadingOlder = useSession((s) => s.loadingOlder);',
  '\t\t\t// ' + LOAD_ALL_HISTORY_UI_MARKER + ' — load-all progress / limit state.',
  '\t\t\tconst loadingAllHistory = useSession((s) => s.loadingAllHistory);',
  '\t\t\tconst loadAllLoaded = useSession((s) => s.loadAllLoaded);',
  '\t\t\tconst loadAllLimitReached = useSession((s) => s.loadAllLimitReached);',
].join('\n');

const LOAD_ALL_HISTORY_UI_ANCHORED_ANCHOR = [
  '\t\t\tconst loadOlderAnchored = () => {',
  '\t\t\t\tconst local = listRef.current;',
  '\t\t\t\t/* v8 ignore next -- ref-null guard: the paging button renders inside the list tree. */',
  '\t\t\t\tif (local !== null) {',
  '\t\t\t\t\tconst el = scrollerOf(local);',
  '\t\t\t\t\tconst row = pagingAnchor(local, el);',
  '\t\t\t\t\tif (row !== null && row.dataset.chatAnchorKey !== void 0) anchorRef.current = {',
  '\t\t\t\t\t\tkey: row.dataset.chatAnchorKey,',
  '\t\t\t\t\t\ttop: flowTop(row, el)',
  '\t\t\t\t\t};',
  '\t\t\t\t}',
  '\t\t\t\tloadOlder();',
  '\t\t\t};',
].join('\n');
const LOAD_ALL_HISTORY_UI_ANCHORED_REPLACEMENT = [
  '\t\t\tconst loadOlderAnchored = () => {',
  '\t\t\t\tconst local = listRef.current;',
  '\t\t\t\t/* v8 ignore next -- ref-null guard: the paging button renders inside the list tree. */',
  '\t\t\t\tif (local !== null) {',
  '\t\t\t\t\tconst el = scrollerOf(local);',
  '\t\t\t\t\tconst row = pagingAnchor(local, el);',
  '\t\t\t\t\tif (row !== null && row.dataset.chatAnchorKey !== void 0) anchorRef.current = {',
  '\t\t\t\t\t\tkey: row.dataset.chatAnchorKey,',
  '\t\t\t\t\t\ttop: flowTop(row, el)',
  '\t\t\t\t\t};',
  '\t\t\t\t}',
  '\t\t\t\tloadOlder();',
  '\t\t\t};',
  '\t\t\t// ' + LOAD_ALL_HISTORY_UI_MARKER + ' — same first-batch anchor as loadOlder (keeps reading',
  '\t\t\t// position stable while the batch stream prepends older content).',
  '\t\t\tconst loadAllHistoryAnchored = () => {',
  '\t\t\t\tconst local = listRef.current;',
  '\t\t\t\t/* v8 ignore next -- ref-null guard: the paging button renders inside the list tree. */',
  '\t\t\t\tif (local !== null) {',
  '\t\t\t\t\tconst el = scrollerOf(local);',
  '\t\t\t\t\tconst row = pagingAnchor(local, el);',
  '\t\t\t\t\tif (row !== null && row.dataset.chatAnchorKey !== void 0) anchorRef.current = {',
  '\t\t\t\t\t\tkey: row.dataset.chatAnchorKey,',
  '\t\t\t\t\t\ttop: flowTop(row, el)',
  '\t\t\t\t\t};',
  '\t\t\t\t}',
  '\t\t\t\tloadAllHistory();',
  '\t\t\t};',
].join('\n');

const LOAD_ALL_HISTORY_UI_BUTTON_ANCHOR = [
  '\t\t\t\t\t\t\thasMore && (0, react_jsx_runtime.jsx)("div", {',
  '\t\t\t\t\t\t\t\tclassName: ChatView_module_css_default.older,',
  '\t\t\t\t\t\t\t\tchildren: (0, react_jsx_runtime.jsx)("button", {',
  '\t\t\t\t\t\t\t\t\ttype: "button",',
  '\t\t\t\t\t\t\t\t\tdisabled: loadingOlder,',
  '\t\t\t\t\t\t\t\t\tonClick: loadOlderAnchored,',
  '\t\t\t\t\t\t\t\t\tchildren: loadingOlder ? t("loading") : t("chat.loadOlder")',
  '\t\t\t\t\t\t\t\t})',
  '\t\t\t\t\t\t\t}),',
].join('\n');
const LOAD_ALL_HISTORY_UI_BUTTON_REPLACEMENT = [
  '\t\t\t\t\t\t\thasMore && (0, react_jsx_runtime.jsx)("div", {',
  '\t\t\t\t\t\t\t\tclassName: ChatView_module_css_default.older,',
  '\t\t\t\t\t\t\t\tchildren: (0, react_jsx_runtime.jsx)("button", {',
  '\t\t\t\t\t\t\t\t\ttype: "button",',
  '\t\t\t\t\t\t\t\t\tdisabled: loadingOlder,',
  '\t\t\t\t\t\t\t\t\tonClick: loadOlderAnchored,',
  '\t\t\t\t\t\t\t\t\tchildren: loadingOlder ? t("loading") : t("chat.loadOlder")',
  '\t\t\t\t\t\t\t\t})',
  '\t\t\t\t\t\t\t}),',
  '\t\t\t\t\t\t\t// ' + LOAD_ALL_HISTORY_UI_MARKER + ' — progress line while a batch load is running.',
  '\t\t\t\t\t\t\tloadingAllHistory && (0, react_jsx_runtime.jsx)("div", {',
  '\t\t\t\t\t\t\t\tclassName: ChatView_module_css_default.older,',
  '\t\t\t\t\t\t\t\tchildren: t("chat.loadAllProgress", {',
  '\t\t\t\t\t\t\t\t\tloaded: loadAllLoaded ?? 0',
  '\t\t\t\t\t\t\t\t})',
  '\t\t\t\t\t\t\t}),',
  '\t\t\t\t\t\t\t// ' + LOAD_ALL_HISTORY_UI_MARKER + ' — start/cancel toggle (hidden once limit hit).',
  '\t\t\t\t\t\t\thasMore && !loadAllLimitReached && (0, react_jsx_runtime.jsx)("div", {',
  '\t\t\t\t\t\t\t\tclassName: ChatView_module_css_default.older,',
  '\t\t\t\t\t\t\t\tchildren: (0, react_jsx_runtime.jsx)("button", {',
  '\t\t\t\t\t\t\t\t\ttype: "button",',
  '\t\t\t\t\t\t\t\t\tonClick: loadingAllHistory ? cancelLoadAllHistory : loadAllHistoryAnchored,',
  '\t\t\t\t\t\t\t\t\tchildren: loadingAllHistory ? t("chat.loadAllCancel") : t("chat.loadAllHistory")',
  '\t\t\t\t\t\t\t\t})',
  '\t\t\t\t\t\t\t}),',
  '\t\t\t\t\t\t\t// ' + LOAD_ALL_HISTORY_UI_MARKER + ' — reached the protection cap; more is still available via loadOlder.',
  '\t\t\t\t\t\t\thasMore && !loadingAllHistory && loadAllLimitReached && (0, react_jsx_runtime.jsx)("div", {',
  '\t\t\t\t\t\t\t\tclassName: ChatView_module_css_default.older,',
  '\t\t\t\t\t\t\t\tchildren: t("chat.loadAllLimit", {',
  '\t\t\t\t\t\t\t\t\tloaded: loadAllLoaded ?? 0',
  '\t\t\t\t\t\t\t\t})',
  '\t\t\t\t\t\t\t}),',
].join('\n');

const LOAD_ALL_HISTORY_UI_INJECT_ANCHOR = [
  '\t\t\t\t\t\tloadOlder: () => {',
  '\t\t\t\t\t\t\tscoped.loadOlder();',
  '\t\t\t\t\t\t},',
].join('\n');
const LOAD_ALL_HISTORY_UI_INJECT_REPLACEMENT = [
  '\t\t\t\t\t\tloadOlder: () => {',
  '\t\t\t\t\t\t\tscoped.loadOlder();',
  '\t\t\t\t\t\t},',
  '\t\t\t\t\t\tloadAllHistory: () => {',
  '\t\t\t\t\t\t\tscoped.loadAllHistory();',
  '\t\t\t\t\t\t},',
  '\t\t\t\t\t\tcancelLoadAllHistory: () => {',
  '\t\t\t\t\t\t\tscoped.cancelLoadAllHistory();',
  '\t\t\t\t\t\t},',
].join('\n');

const LOAD_ALL_HISTORY_UI_ZH_ANCHOR = '\t\t\t"chat.loadOlder": "加载更早",';
const LOAD_ALL_HISTORY_UI_ZH_REPLACEMENT = [
  '\t\t\t"chat.loadOlder": "加载更早",',
  '\t\t\t"chat.loadAllHistory": "加载全部历史",',
  '\t\t\t"chat.loadAllProgress": "已加载 {loaded} 条历史…",',
  '\t\t\t"chat.loadAllCancel": "停止加载",',
  '\t\t\t"chat.loadAllLimit": "已加载 {loaded} 条历史（已达上限，可继续「加载更早」）",',
].join('\n');

const LOAD_ALL_HISTORY_UI_EN_ANCHOR = '\t\t\t"chat.loadOlder": "Load earlier",';
const LOAD_ALL_HISTORY_UI_EN_REPLACEMENT = [
  '\t\t\t"chat.loadOlder": "Load earlier",',
  '\t\t\t"chat.loadAllHistory": "Load all history",',
  '\t\t\t"chat.loadAllProgress": "Loaded {loaded} messages…",',
  '\t\t\t"chat.loadAllCancel": "Stop loading",',
  '\t\t\t"chat.loadAllLimit": "Loaded {loaded} messages (limit reached — use \u201cLoad earlier\u201d for more)",',
].join('\n');

function transformLoadAllHistoryUi(src, file) {
  if (src.includes(LOAD_ALL_HISTORY_UI_MARKER)) return { status: 'already' };
  const anchors = [
    LOAD_ALL_HISTORY_UI_CTRL_ANCHOR,
    LOAD_ALL_HISTORY_UI_SIGNATURE_OLD,
    LOAD_ALL_HISTORY_UI_STATE_ANCHOR,
    LOAD_ALL_HISTORY_UI_ANCHORED_ANCHOR,
    LOAD_ALL_HISTORY_UI_BUTTON_ANCHOR,
    LOAD_ALL_HISTORY_UI_INJECT_ANCHOR,
    LOAD_ALL_HISTORY_UI_ZH_ANCHOR,
    LOAD_ALL_HISTORY_UI_EN_ANCHOR,
  ];
  const missing = [];
  if (!src.includes(anchors[0])) missing.push('controller loadOlder');
  if (!src.includes(anchors[1])) missing.push('ChatView signature');
  if (!src.includes(anchors[2])) missing.push('loadingOlder state');
  if (!src.includes(anchors[3])) missing.push('loadOlderAnchored');
  if (!src.includes(anchors[4])) missing.push('loadOlder button');
  if (!src.includes(anchors[5])) missing.push('inject loadOlder');
  if (!src.includes(anchors[6])) missing.push('zh loadOlder');
  if (!src.includes(anchors[7])) missing.push('en loadOlder');
  if (missing.length > 0) {
    return { status: 'anchor-missing', detail: '未找到 load-all-history UI 锚点（版本可能已变更）：' + missing.join(' / ') + '，跳过 ' + file };
  }
  let out = src;
  out = out.replace(anchors[0], LOAD_ALL_HISTORY_UI_CTRL_REPLACEMENT);
  out = out.replace(anchors[1], LOAD_ALL_HISTORY_UI_SIGNATURE_NEW);
  out = out.replace(anchors[2], LOAD_ALL_HISTORY_UI_STATE_REPLACEMENT);
  out = out.replace(anchors[3], LOAD_ALL_HISTORY_UI_ANCHORED_REPLACEMENT);
  out = out.replace(anchors[4], LOAD_ALL_HISTORY_UI_BUTTON_REPLACEMENT);
  out = out.replace(anchors[5], LOAD_ALL_HISTORY_UI_INJECT_REPLACEMENT);
  out = out.replace(anchors[6], LOAD_ALL_HISTORY_UI_ZH_REPLACEMENT);
  out = out.replace(anchors[7], LOAD_ALL_HISTORY_UI_EN_REPLACEMENT);
  return { status: 'changed', src: out };
}

// ---------------------------------------------------------------------------
// skill 工具行汉化（K27）：dsh-client-ui-skill 的 SkillRow 里「Skill」标题与
// 「Inspect」按钮是硬编码英文，绕过 locale 词典（zh/en 已齐备）。补丁把两处
// 改为 t("row.title") / t("row.inspect")，并在 zh/en 词典补齐对应键。工具名
// "skill"（keyed slot key 与注册名）、模型侧提示词（tool description / catalog
// system-reminder）与 skill 名均不动。目标：dsh-client-ui-skill/lib/client.js。
// ---------------------------------------------------------------------------
const SKILL_UI_ZH_MARKER = 'dsh-desktop i18n: skill row title/inspect';

const SKILL_UI_TITLE_OLD = '\t\t\t\t\t\t\tchildren: "Skill"';
const SKILL_UI_TITLE_NEW = '\t\t\t\t\t\t\tchildren: t("row.title")';

const SKILL_UI_INSPECT_OLD = '\t\t\t\t\t\tchildren: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconInspectOutline12, {}), "Inspect"]';
const SKILL_UI_INSPECT_NEW = '\t\t\t\t\t\tchildren: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconInspectOutline12, {}), t("row.inspect")]';

const SKILL_UI_NS_OLD = '\t\tconst NS = "skill";';
const SKILL_UI_NS_NEW = '\t\tconst NS = "skill"; // ' + SKILL_UI_ZH_MARKER;

const SKILL_UI_ZH_ANCHOR = '\t\t\t"menu.userOnly": "仅用户"\n\t\t};';
const SKILL_UI_ZH_REPLACEMENT = [
  '\t\t\t"menu.userOnly": "仅用户",',
  '\t\t\t"row.title": "技能",',
  '\t\t\t"row.inspect": "查看"',
  '\t\t};',
].join('\n');

const SKILL_UI_EN_ANCHOR = '\t\t\t"menu.userOnly": "user-only"\n\t\t};';
const SKILL_UI_EN_REPLACEMENT = [
  '\t\t\t"menu.userOnly": "user-only",',
  '\t\t\t"row.title": "Skill",',
  '\t\t\t"row.inspect": "Inspect"',
  '\t\t};',
].join('\n');

/** skill 工具行汉化变换（幂等，锚点失配跳过；工具名与模型侧提示词不动）。 */
function transformSkillUiZh(src, file) {
  if (src.includes(SKILL_UI_ZH_MARKER)) return { status: 'already' };
  const missing = [];
  if (!src.includes(SKILL_UI_TITLE_OLD)) missing.push('SkillRow 标题 "Skill"');
  if (!src.includes(SKILL_UI_INSPECT_OLD)) missing.push('Inspect 按钮');
  if (!src.includes(SKILL_UI_ZH_ANCHOR)) missing.push('zh 词典 menu.userOnly 尾行');
  if (!src.includes(SKILL_UI_EN_ANCHOR)) missing.push('en 词典 menu.userOnly 尾行');
  if (!src.includes(SKILL_UI_NS_OLD)) missing.push('const NS = "skill"');
  if (missing.length > 0) {
    return { status: 'anchor-missing', detail: '未找到 skill 行汉化锚点（版本可能已变更）：' + missing.join(' / ') + '，跳过 ' + file };
  }
  let out = src;
  out = out.replace(SKILL_UI_TITLE_OLD, SKILL_UI_TITLE_NEW);
  out = out.replace(SKILL_UI_INSPECT_OLD, SKILL_UI_INSPECT_NEW);
  out = out.replace(SKILL_UI_ZH_ANCHOR, SKILL_UI_ZH_REPLACEMENT);
  out = out.replace(SKILL_UI_EN_ANCHOR, SKILL_UI_EN_REPLACEMENT);
  out = out.replace(SKILL_UI_NS_OLD, SKILL_UI_NS_NEW);
  return { status: 'changed', src: out };
}

// ---------------------------------------------------------------------------
// 会话 header 扫描缓存 + 读取上限（K5，v0.5.4 求稳）。
//
// 根因（用户实测，直接采信）：打开子代理 → dsh-subagent 调 persistence.list()
// → listArtifacts 全量扫描 291 个会话文件、每个都 zstd 解压 header；机器 commit
// 内存吃紧（WebView2 866MB + OpenCode/msedge/marktext），全量扫描把内核 node
// 进程顶爆 OOM（堆仅 150-260MB 就「Committing semi space failed」）→ 崩溃环。
//
// 修法（保守二级收敛，不破坏 list()/listSnapshots()/materialize 既有语义）：
//   1) header 扫描缓存：listArtifacts 读 header 前先 stat，命中 (path,size,
//      mtimeNs) 缓存直接复用 header（二次 list()/刷新列表零解码），未命中才
//      读首行并写缓存。缓存为模块级 Map + FIFO 上限（跨 list() 调用生效、不随
//      实例生命周期泄漏）；size/mtimeNs 任一变化即失效重读，不掩盖真实变更。
//   2) 读取上限：readFirstZstdLine 累积缓冲超 256KB 仍未找到完整首帧即抛错，
//      被 listArtifacts 既有 corrupt-guard catch 后 warn 跳过（损坏/写入中的
//      文件不再整读进内存反复扫描），不击穿启动扫描。
//
// 幂等 marker 双点注入（模块级常量注释 + 读上限注释），锚点失配自动退役。
// 目标：dsh-session-persistence-jsonl/lib/index.js（PERSISTENCE_PKG_REL）。
// ---------------------------------------------------------------------------
const SESSION_HEADER_SCAN_MARKER = 'dsh-desktop fix: session header scan cache + bounded read';

const SESSION_HEADER_SCAN_MODULE_ANCHOR = 'function isENOENT(error) {';
const SESSION_HEADER_SCAN_MODULE_INJECTION = [
  '// ' + SESSION_HEADER_SCAN_MARKER + ' (K5)：打开子代理全量扫描 291 个会话文件、每个都',
  '// zstd 解压 header，在 commit 内存吃紧时把内核 node 顶爆 OOM。二级收敛：1) 按',
  '// (path,size,mtimeNs) 缓存已解析 header（文件未变二次 list()/刷新列表零解码）；',
  '// 2) readFirstZstdLine 累积缓冲封顶 256KB（损坏/写入中文件不再整读进内存反复扫描）。',
  '// 缓存为模块级 Map + FIFO 上限，跨 list() 调用生效且不随实例生命周期泄漏；',
  '// size/mtimeNs 任一变化即失效重读，不掩盖真实变更。',
  'const ZSTD_HEADER_SCAN_MAX_BYTES = 256 * 1024;',
  'const SESSION_HEADER_SCAN_CACHE_MAX = 4096;',
  'const sessionHeaderScanCache = new Map();',
  'function sessionHeaderScanCacheGet(path, size, mtimeNs) {',
  '\tconst entry = sessionHeaderScanCache.get(path);',
  '\tif (entry !== void 0 && entry.size === size && entry.mtimeNs === mtimeNs) return entry.first;',
  '\tif (entry !== void 0) sessionHeaderScanCache.delete(path);',
  '\treturn void 0;',
  '}',
  'function sessionHeaderScanCacheSet(path, size, mtimeNs, first) {',
  '\tif (first === void 0) return;',
  '\tif (sessionHeaderScanCache.has(path)) sessionHeaderScanCache.delete(path);',
  '\tsessionHeaderScanCache.set(path, { size, mtimeNs, first });',
  '\tif (sessionHeaderScanCache.size > SESSION_HEADER_SCAN_CACHE_MAX) {',
  '\t\tconst oldestKey = sessionHeaderScanCache.keys().next().value;',
  '\t\tif (oldestKey !== void 0) sessionHeaderScanCache.delete(oldestKey);',
  '\t}',
  '}',
].join('\n');

const SESSION_HEADER_SCAN_METHOD_ANCHOR = '\t/** Read and validate only the independently compressed header frame. */';
const SESSION_HEADER_SCAN_METHOD_INJECTION = [
  '\t/**',
  '\t * ' + SESSION_HEADER_SCAN_MARKER + ' — stat 后命中缓存直接复用 header（size+mtimeNs',
  '\t * 未变），未命中才读首行并写缓存；miss 路径走 readFirstZstdLine/readFirstLine',
  '\t *（含其 256KB 读上限），解析/身份校验仍由 listArtifacts 原链路负责。',
  '\t */',
  '\tasync readHeaderLineCached(path, signal) {',
  '\t\tsignal?.throwIfAborted();',
  '\t\tconst identity = await stat(path, { bigint: true });',
  '\t\tsignal?.throwIfAborted();',
  '\t\tconst cached = sessionHeaderScanCacheGet(path, identity.size, identity.mtimeNs);',
  '\t\tif (cached !== void 0) return cached;',
  '\t\tconst first = this.compression === "zstd" ? await this.readFirstZstdLine(path, signal) : await this.readFirstLine(path, signal);',
  '\t\tsessionHeaderScanCacheSet(path, identity.size, identity.mtimeNs, first);',
  '\t\treturn first;',
  '\t}',
  '\t/** Read and validate only the independently compressed header frame. */',
].join('\n');

const SESSION_HEADER_SCAN_READ_EXPR = 'this.compression === "zstd" ? await this.readFirstZstdLine(path, signal) : await this.readFirstLine(path, signal)';

const SESSION_HEADER_SCAN_CAP_ANCHOR = '\t\t\t\tcontent = Buffer.concat([content, chunk.subarray(0, bytesRead)]);';
const SESSION_HEADER_SCAN_CAP_INJECTION = [
  '\t\t\t\tcontent = Buffer.concat([content, chunk.subarray(0, bytesRead)]);',
  '\t\t\t\t// ' + SESSION_HEADER_SCAN_MARKER + ' — 累积缓冲封顶：损坏/写入中的日志不再被整读进',
  '\t\t\t\t// 内存反复扫描（listArtifacts 的 corrupt-guard catch 后 warn 跳过，不击穿启动扫描）。',
  '\t\t\t\tif (content.length > ZSTD_HEADER_SCAN_MAX_BYTES) throw new Error(`corrupt Zstandard session log: no complete header frame within ${ZSTD_HEADER_SCAN_MAX_BYTES} bytes`);',
].join('\n');

function transformSessionHeaderScanGuard(src, file) {
  if (src.includes(SESSION_HEADER_SCAN_MARKER)) return { status: 'already' };
  const missing = [];
  if (!src.includes(SESSION_HEADER_SCAN_MODULE_ANCHOR)) missing.push('module anchor (isENOENT)');
  if (!src.includes(SESSION_HEADER_SCAN_METHOD_ANCHOR)) missing.push('readFirstZstdLine JSDoc');
  if (!src.includes(SESSION_HEADER_SCAN_READ_EXPR)) missing.push('listArtifacts read expression');
  if (!src.includes(SESSION_HEADER_SCAN_CAP_ANCHOR)) missing.push('readFirstZstdLine concat');
  if (missing.length > 0) {
    return { status: 'anchor-missing', detail: '未找到 session header scan 锚点（版本可能已变更）：' + missing.join(' / ') + '，跳过 ' + file };
  }
  let out = src;
  // 函数替换器：注入文本含 ${...} 模板字面量，规避 String.replace 对 $ 序列的替换语义。
  out = out.replace(SESSION_HEADER_SCAN_READ_EXPR, () => 'await this.readHeaderLineCached(path, signal)');
  out = out.replace(SESSION_HEADER_SCAN_MODULE_ANCHOR, () => SESSION_HEADER_SCAN_MODULE_INJECTION + '\n\n' + SESSION_HEADER_SCAN_MODULE_ANCHOR);
  out = out.replace(SESSION_HEADER_SCAN_METHOD_ANCHOR, () => SESSION_HEADER_SCAN_METHOD_INJECTION);
  out = out.replace(SESSION_HEADER_SCAN_CAP_ANCHOR, () => SESSION_HEADER_SCAN_CAP_INJECTION);
  return { status: 'changed', src: out };
}

// ---------------------------------------------------------------------------
// 会话加载撕裂尾部优雅降级（K6，v0.5.4 求稳）。
//
// 根因（代码推演 + 用户反馈直接采信）：自动压缩（auto-compaction）把一个
// 多事件批次（compaction/start、compaction/summary、user/message replace、
// compaction/end）一次性追加落盘，帧体比单事件帧更大；中断/崩溃后既可能留下
// 「结构撕裂的最后一帧」（已被第 1 行 torn-tail 恢复兜住），也可能留下「结构
// 完整但校验失败 / seq 断档 / 中部非法 magic」的损坏帧——后者会让
// readZstdPrefix 抛致命错。而 loadHistory 读路径不像 listArtifacts 有
// corrupt-guard，于是「历史加载失败」直接击穿，随后渲染进程崩溃。
//
// 修法（保守，方向 c）：readZstdPrefix 的解码/校验失败时降级为「加载到最后一
// 个完整帧」——返回已解码前缀 + tornMarker（指向首个损坏帧起始），由
// commitRepair 截断损坏尾部并补 closers；console.warn 保留告警（不掩盖真实
// 损坏）；header 帧损坏仍致命（scanner 未建立即重抛）。listArtifacts 的
// corrupt-guard 语义与 K5 的 header 扫描缓存均不受影响。
//
// 幂等 marker 单点注入（catch 分支注释），锚点失配自动退役。
// 目标：dsh-session-persistence-jsonl/lib/index.js（PERSISTENCE_PKG_REL）。
// ---------------------------------------------------------------------------
const SESSION_LOAD_GRACEFUL_MARKER = 'dsh-desktop compat: degrade session load to last complete frame';

// 锚点全部取「上游 pristine 与 torn-tail 已应用形态共有的稳定行」，故本补丁
// 既能在 pristine（.tmp-rc2-stage）命中，也能在 torn-tail/corrupt-guard/K5 已
// 应用的运行时副本上命中（二阶补丁不依赖一阶补丁注入的 frameIndex，改用自持
// loadFrameIndex 计数）。
const SESSION_LOAD_GRACEFUL_DECODER_OLD = '\t\tconst decoder = createZstdFrameDecoder();\n\t\tlet yieldDeadline = performance.now() + ZSTD_DECODE_YIELD_INTERVAL_MS;\n\t\ttry {';
const SESSION_LOAD_GRACEFUL_DECODER_NEW = '\t\tconst decoder = createZstdFrameDecoder();\n\t\tlet scanner;\n\t\tlet loadFrameIndex = 1;\n\t\tlet yieldDeadline = performance.now() + ZSTD_DECODE_YIELD_INTERVAL_MS;\n\t\ttry {';

const SESSION_LOAD_GRACEFUL_SCANNER_OLD = '\t\t\tconst scanner = new SessionLogScanner(headerFrame.value);';
const SESSION_LOAD_GRACEFUL_SCANNER_NEW = '\t\t\tscanner = new SessionLogScanner(headerFrame.value);';

// remainingFrames -= 1 后推进自持计数：解码帧 K 抛错（生成器 .next()）时
// loadFrameIndex === K；torn-JSONL/seq 断档在循环体中部抛错时 loadFrameIndex
// 仍 === K（尚未推进）——两种抛错点都指向首个损坏帧，catch 据此把 truncateTo
// 设为 frames[K].start。
const SESSION_LOAD_GRACEFUL_WRITE_OLD = '\t\t\t\tremainingFrames -= 1;';
const SESSION_LOAD_GRACEFUL_WRITE_NEW = '\t\t\t\tremainingFrames -= 1;\n\t\t\t\tloadFrameIndex += 1;';

const SESSION_LOAD_GRACEFUL_CATCH_OLD = '\t\t} catch (error) {\n\t\t\t/* v8 ignore next -- decoder failure plus concurrent abort is timing-dependent */\n\t\t\tif (signal?.aborted) signal.throwIfAborted();\n\t\t\tthrow error;\n\t\t} finally {';
const SESSION_LOAD_GRACEFUL_CATCH_NEW = [
  '\t\t} catch (error) {',
  '\t\t\t/* v8 ignore next -- decoder failure plus concurrent abort is timing-dependent */',
  '\t\t\tif (signal?.aborted) signal.throwIfAborted();',
  '\t\t\t// ' + SESSION_LOAD_GRACEFUL_MARKER + ': 解码/校验失败降级为「加载到最后一个完整帧」——',
  '\t\t\t// 返回已解码前缀 + tornMarker（指向首个损坏帧起始），由 commitRepair 截断损坏尾部',
  '\t\t\t// 并补 closers；console.warn 保留告警，不掩盖真实损坏（header 帧损坏仍重抛）。',
  '\t\t\tif (scanner !== void 0 && frames !== void 0) {',
  '\t\t\t\tconst corruptStart = loadFrameIndex !== void 0 && loadFrameIndex < frames.length ? frames[loadFrameIndex].start : void 0;',
  '\t\t\t\tconst truncateTo = corruptStart ?? (frames.length > 0 ? frames[frames.length - 1].end : 0);',
  '\t\t\t\tconsole.warn(`[dsh-session-persistence] degraded session load to last complete frame (byte ${truncateTo}): ${error instanceof Error ? error.message : String(error)}`);',
  '\t\t\t\tconst prefix = scanner.finish();',
  '\t\t\t\treturn {',
  '\t\t\t\t\tmeta: prefix.meta,',
  '\t\t\t\t\tevents: prefix.events,',
  '\t\t\t\t\ttornMarker: {',
  '\t\t\t\t\t\ttruncateTo,',
  '\t\t\t\t\t\trecoveredEvents: []',
  '\t\t\t\t\t}',
  '\t\t\t\t};',
  '\t\t\t}',
  '\t\t\tthrow error;',
  '\t\t} finally {',
].join('\n');

function transformSessionLoadGraceful(src, file) {
  if (src.includes(SESSION_LOAD_GRACEFUL_MARKER)) return { status: 'already' };
  const missing = [];
  if (!src.includes(SESSION_LOAD_GRACEFUL_DECODER_OLD)) missing.push('decoder hoist anchor');
  if (!src.includes(SESSION_LOAD_GRACEFUL_SCANNER_OLD)) missing.push('scanner decl anchor');
  if (!src.includes(SESSION_LOAD_GRACEFUL_WRITE_OLD)) missing.push('remainingFrames anchor');
  if (!src.includes(SESSION_LOAD_GRACEFUL_CATCH_OLD)) missing.push('catch rethrow anchor');
  if (missing.length > 0) {
    return { status: 'anchor-missing', detail: '未找到 session load 优雅降级锚点（版本可能已变更）：' + missing.join(' / ') + '，跳过 ' + file };
  }
  let out = src;
  out = out.replace(SESSION_LOAD_GRACEFUL_DECODER_OLD, SESSION_LOAD_GRACEFUL_DECODER_NEW);
  out = out.replace(SESSION_LOAD_GRACEFUL_SCANNER_OLD, SESSION_LOAD_GRACEFUL_SCANNER_NEW);
  out = out.replace(SESSION_LOAD_GRACEFUL_WRITE_OLD, SESSION_LOAD_GRACEFUL_WRITE_NEW);
  out = out.replace(SESSION_LOAD_GRACEFUL_CATCH_OLD, SESSION_LOAD_GRACEFUL_CATCH_NEW);
  return { status: 'changed', src: out };
}

// ---------------------------------------------------------------------------
// Codex CLI 本地二进制回落补丁（2026-08，安装包瘦身移除 @openai/codex-win32-x64
// 原生二进制 codex.exe 后）：@openai/codex/bin/codex.js 的 findCodexExecutable()
// 只解析 vendored 路径，缺失即抛 "Missing optional dependency ... Reinstall"。
// 补丁在抛错前追加回落：CODEX_BIN（显式指定）→ PATH 扫描 codex.exe/codex。
// vendored 路径仍为第一优先（已存在的 vendored 二进制分支完全不变）。
// ---------------------------------------------------------------------------
const CODEX_LOCAL_BIN_MARKER = 'dsh-desktop compat: codex-local-bin-fallback';
// 锚点 = findCodexExecutable() 抛错前的 packageManager 检测两行（2 空格缩进，
// 与顶层同名变量行 0 空格缩进区分，保证唯一命中函数内那一处）。
const CODEX_LOCAL_BIN_ANCHOR = [
  '  const packageManager = detectPackageManager();',
  '  const updateCommand =',
].join('\n');
const CODEX_LOCAL_BIN_INJECTION = [
  '  // ' + CODEX_LOCAL_BIN_MARKER + ' — installer slimmed by removing the bundled',
  '  // @openai/codex-win32-x64 native binary. When the vendored path above is absent,',
  '  // honor an explicit CODEX_BIN or a `codex`/`codex.exe` on PATH before giving up.',
  '  const localCodexBin = process.env.CODEX_BIN;',
  '  if (localCodexBin) {',
  '    if (existsSync(localCodexBin)) return localCodexBin;',
  '  } else if (process.env.PATH) {',
  '    const codexExeName = process.platform === "win32" ? "codex.exe" : "codex";',
  '    for (const codexPathDir of process.env.PATH.split(path.delimiter)) {',
  '      if (!codexPathDir) continue;',
  '      const codexCandidate = path.join(codexPathDir, codexExeName);',
  '      if (existsSync(codexCandidate)) return codexCandidate;',
  '    }',
  '  }',
  '',
  '  const packageManager = detectPackageManager();',
  '  const updateCommand =',
].join('\n');

function transformCodexLocalBinFallback(src, file) {
  if (src.includes(CODEX_LOCAL_BIN_MARKER)) return { status: 'already' };
  if (!src.includes(CODEX_LOCAL_BIN_ANCHOR)) {
    return { status: 'anchor-missing', detail: '未找到 codex findCodexExecutable 抛错前锚点（版本可能已变化），跳过 ' + file };
  }
  return { status: 'changed', src: src.replace(CODEX_LOCAL_BIN_ANCHOR, () => CODEX_LOCAL_BIN_INJECTION) };
}

// ---------------------------------------------------------------------------
// Claude Code 子代理本地二进制回落补丁（2026-08，安装包瘦身移除
// @anthropic-ai/claude-agent-sdk-win32-x64 原生二进制 claude.exe 后）：
// dsh-subagent-claude-code 的 startClaudeCodeRun() 调 query({...}) 时未透传
// pathToClaudeCodeExecutable，SDK 找不到内置二进制即失败。补丁把 options 从
// 直接调用改为展开合并 + pathToClaudeCodeExecutable: process.env.CLAUDE_BIN，
// 未设 CLAUDE_BIN 时为 undefined（SDK 语义回落到内置/自动发现，行为不变）。
// ---------------------------------------------------------------------------
const CLAUDE_LOCAL_BIN_MARKER = 'dsh-desktop compat: claude-local-bin-fallback';
const CLAUDE_LOCAL_BIN_ANCHOR = [
  '\t\tquery$1 = query({',
  '\t\t\tprompt,',
  '\t\t\toptions: claudeQueryOptions(spec, controller, captureChild, capturePermissionDiagnostic)',
  '\t\t});',
].join('\n');
const CLAUDE_LOCAL_BIN_INJECTION = [
  '\t\tquery$1 = query({',
  '\t\t\tprompt,',
  '\t\t\toptions: {',
  '\t\t\t\t// ' + CLAUDE_LOCAL_BIN_MARKER + ' — installer slimmed by removing the',
  '\t\t\t\t// bundled @anthropic-ai/claude-agent-sdk-win32-x64 native binary; point',
  '\t\t\t\t// the SDK at a local Claude Code CLI via CLAUDE_BIN when provided.',
  '\t\t\t\t...claudeQueryOptions(spec, controller, captureChild, capturePermissionDiagnostic),',
  '\t\t\t\tpathToClaudeCodeExecutable: process.env.CLAUDE_BIN || undefined',
  '\t\t\t}',
  '\t\t});',
].join('\n');

function transformClaudeLocalBinFallback(src, file) {
  if (src.includes(CLAUDE_LOCAL_BIN_MARKER)) return { status: 'already' };
  if (!src.includes(CLAUDE_LOCAL_BIN_ANCHOR)) {
    return { status: 'anchor-missing', detail: '未找到 claude subagent query({...}) 调用锚点（版本可能已变化），跳过 ' + file };
  }
  return { status: 'changed', src: src.replace(CLAUDE_LOCAL_BIN_ANCHOR, () => CLAUDE_LOCAL_BIN_INJECTION) };
}

// ---------------------------------------------------------------------------
// skill 目录兼容补丁（2026-08，用户技能管理面板空白反馈）：内核
// dsh-skill-filesystem 的 roots() 只扫 .dsh/.agents 系根（project × 2 +
// custom + user × 2 + bundled），用户为 Claude Code（~/.claude/skills）与
// Codex CLI（~/.codex/skills）装的技能一概不可见——桌面技能管理面板
//（dsh-basics-panel 经 ctx.skills.snapshot()）对这类用户显示为空。补丁
// 两点（单 marker 幂等，锚点失配自动退役）：
//   1) roots() 在 includeDefaultRoots 分支追加 user-claude / user-codex 两
//      个常用约定根，rank 取 USER_AGENTS_RANK+10 / +20（低于 custom 300 与
//      user-agents 500、仍高于 bundled 600——自定义目录与 .agents 用户根
//      优先级不变；复用文件已 import 的 homedir，不新增依赖）；
//   2) 构造器把 DSH_SKILL_DIRS（path.delimiter 分隔，过滤空段）并入
//      this.customSkillDirs，与 config 条目同样 resolve + CUSTOM_RANK。
// 顺带把 node:path 命名导入扩一个 delimiter（ESM 产物无 path 命名空间可用，
// 不扩则注入体是 ReferenceError）。
// ---------------------------------------------------------------------------
const SKILL_DIRS_COMPAT_MARKER = 'dsh-desktop compat: skill-dirs-compat';
// 锚点 0：node:path 命名导入行（delimiter 并入，按字母序插在最前）。
const SKILL_DIRS_IMPORT_ANCHOR = 'import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";';
const SKILL_DIRS_IMPORT_NEW = 'import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";';
// 锚点 1：构造器 customSkillDirs 装配行（DSH_SKILL_DIRS 并入，紧随其后）。
const SKILL_DIRS_CUSTOM_ANCHOR = '\t\tthis.customSkillDirs = (config.customSkillDirs ?? []).map((root) => resolve(root));';
const SKILL_DIRS_CUSTOM_NEW = [
  SKILL_DIRS_CUSTOM_ANCHOR,
  '\t\t// ' + SKILL_DIRS_COMPAT_MARKER + ' — DSH_SKILL_DIRS adds extra custom skill roots on top of',
  '\t\t// the config list (path.delimiter-separated, e.g. "C:\\skills;D:\\more"); entries',
  '\t\t// resolve and rank exactly like config customSkillDirs (CUSTOM_RANK).',
  '\t\tthis.customSkillDirs.push(...String(process.env.DSH_SKILL_DIRS ?? "")',
  '\t\t\t.split(delimiter)',
  '\t\t\t.filter((dir) => dir !== "")',
  '\t\t\t.map((dir) => resolve(dir)));',
].join('\n');
// 锚点 2：roots() 的 user-dsh / user-agents push 块（user-claude / user-codex
// 追加为同一 push 调用的后两个实参，includeDefaultRoots 语义自动覆盖）。
const SKILL_DIRS_ROOTS_ANCHOR = [
  '\t\tif (this.includeDefaultRoots) roots.push({',
  '\t\t\tpath: join(this.dshHome, "skills"),',
  '\t\t\tsource: "user-dsh",',
  '\t\t\trank: USER_DSH_RANK,',
  '\t\t\tskipSystem: true',
  '\t\t}, {',
  '\t\t\tpath: join(this.agentsHome, "skills"),',
  '\t\t\tsource: "user-agents",',
  '\t\t\trank: USER_AGENTS_RANK',
  '\t\t});',
].join('\n');
const SKILL_DIRS_ROOTS_NEW = [
  '\t\tif (this.includeDefaultRoots) roots.push({',
  '\t\t\tpath: join(this.dshHome, "skills"),',
  '\t\t\tsource: "user-dsh",',
  '\t\t\trank: USER_DSH_RANK,',
  '\t\t\tskipSystem: true',
  '\t\t}, {',
  '\t\t\tpath: join(this.agentsHome, "skills"),',
  '\t\t\tsource: "user-agents",',
  '\t\t\trank: USER_AGENTS_RANK',
  '\t\t}, {',
  '\t\t\t// ' + SKILL_DIRS_COMPAT_MARKER + ' — common Claude Code / Codex CLI skill directories',
  '\t\t\t// are first-class user roots so skills installed for those CLIs appear in skill',
  '\t\t\t// management; ranks stay above user-agents and below bundled so custom and',
  '\t\t\t// .agents roots keep precedence.',
  '\t\t\tpath: join(homedir(), ".claude", "skills"),',
  '\t\t\tsource: "user-claude",',
  '\t\t\trank: USER_AGENTS_RANK + 10',
  '\t\t}, {',
  '\t\t\tpath: join(homedir(), ".codex", "skills"),',
  '\t\t\tsource: "user-codex",',
  '\t\t\trank: USER_AGENTS_RANK + 20',
  '\t\t});',
].join('\n');

function transformSkillDirsCompat(src, file) {
  if (src.includes(SKILL_DIRS_COMPAT_MARKER)) return { status: 'already' };
  const missing = [];
  if (!src.includes(SKILL_DIRS_IMPORT_ANCHOR)) missing.push('node:path import');
  if (!src.includes(SKILL_DIRS_CUSTOM_ANCHOR)) missing.push('customSkillDirs constructor line');
  if (!src.includes(SKILL_DIRS_ROOTS_ANCHOR)) missing.push('roots() user-agents push');
  if (missing.length > 0) {
    return { status: 'anchor-missing', detail: '未找到 skill 目录兼容锚点（版本可能已变更）：' + missing.join(' / ') + '，跳过 ' + file };
  }
  let out = src.replace(SKILL_DIRS_IMPORT_ANCHOR, () => SKILL_DIRS_IMPORT_NEW);
  out = out.replace(SKILL_DIRS_CUSTOM_ANCHOR, () => SKILL_DIRS_CUSTOM_NEW);
  out = out.replace(SKILL_DIRS_ROOTS_ANCHOR, () => SKILL_DIRS_ROOTS_NEW);
  return { status: 'changed', src: out };
}

// pi-ai 4xx 请求落盘（独立脚本实现，registry 经此引用保持单一收口）。
const { transform4xxDump: transformPiAi4xxDump, MARKER: PI_AI_4XX_DUMP_MARKER } = require('../patch-pi-ai-4xx-dump');
const { transformToolSchemaSanitize: transformPiAiToolSchemaSanitize, MARKER: PI_AI_TOOL_SCHEMA_SANITIZE_MARKER } = require('../patch-pi-ai-tool-schema-sanitize');
const { transformDsToolSchemaSanitize, MARKER: DS_TOOL_SCHEMA_SANITIZE_MARKER } = require('../patch-ds-tool-schema-sanitize');

module.exports = {
  // runtime-patches 的 transform（re-export）。其中 transformPersistenceAll 不被
  // registry 直接引用，其消费方是 rootAppliers.patchSessionPersistence
  // （session-persistence 以 root 应用器形态登记），此处 re-export 仅为保持
  // transform 收口的对称性，非死代码。
  transformPiAi4xxDump,
  PI_AI_4XX_DUMP_MARKER,
  PI_AI_TOOL_SCHEMA_SANITIZE_MARKER,
  transformPiAiToolSchemaSanitize,
  DS_TOOL_SCHEMA_SANITIZE_MARKER,
  transformDsToolSchemaSanitize,
  transformFlashFix,
  transformPersistenceAll,
  transformLegacySlotKey,
  transformSlotUnkeyedCompat,
  transformSlotErrorIsolation,
  transformShellDescriptionOptional,
  transformAttachmentMimeTrust,
  transformProfilePatchGuard,
  transformProfileBundleAppBoot,
  transformProfileBundleProfileBoot,
  transformSettingsSectionGuard,
  transformManualSortFix,
  transformPluginInventoryTabMergeFix,
  // 持久 shell 停止修复（abort race + 中断升级）。
  transformPersistentShellAbortRace,
  transformTerminalInterruptEscalation,
  // agent-preset 未知 id 回落（0.5.0 存量用户 resume 变砖修复）。
  transformAgentPresetFallback,
  // dsh-system-prompt 字面量透传（graph-memory {{state.gold}} 模板注入瘫会话修复）。
  transformPromptContextLiteral,
  // K1（credentials service is absent 偶发）三层修复。
  transformFallbackHealIsolation,
  transformCredentialsInitialRetry,
  transformCredentialsAbsentGuidance,
  // 设备未授权（DeepSeek 服务端风控 403）报文追加可操作指引。
  transformDeviceAuthGuidance,
  // #154 第三根因：内核 web UI boot 看门狗（client module system 不可达不无限转圈）。
  transformKernelBootWatchdog,
  // W1 问题四：WSL 内目录选择器强制 browse（zenity 窗口在 WSLg 里不可见）。
  transformDirectoryPickerWslBrowse,
  // R7：adapter 缺 prepareCall 时回落基类语义 + 升级指引（v0.5.3 对话失败）。
  transformAdapterPrepareCallGuard,
  transformSessionHeaderScanGuard,
  transformSessionLoadGraceful,
  // Codex / Claude 子代理本地二进制回落（安装包瘦身移除原生二进制后）。
  transformCodexLocalBinFallback,
  transformClaudeLocalBinFallback,
  // skill 目录兼容（~/.claude/skills、~/.codex/skills + DSH_SKILL_DIRS 参与发现）。
  transformSkillDirsCompat,
  // K1 注入体常量（单测 vm 行为验证用，与 transform 同源；非 marker）。
  CREDENTIALS_HELPERS_CODE,
  // 包级补丁 node_modules 根应用器（唯一实现）。
  rootAppliers: {
    patchWebSearchBaseUrl,
    patchMenuViewport,
    patchOpenProjectDir,
    patchSessionPersistence,
    patchSessionManage,
    patchToolSourceCompat,
    patchPiAiOpencodeGoModels,
    patchPiAiCredits,
    patchPiAiReasoningDefaults,
    patchPiAiOverflowMessage,
    patchTokenMeterClamp,
    patchAtomicWriteOrphanLock,
    patchSettingsModelsResilience,
    patchBundleArrivalRetry,
    patchSchedulerGuard,
    patchEmptyToolName,
  },
  // 幂等 marker（单一数据源）：registry 与 transform 的 already 判定引用同一常量，
  // 杜绝「marker 跨模块复制漂移」。slot 系 marker 来自 runtime-patches（与 slot
  // transform 同源），bundle-guard 系来自 profile-bundle-heal，loader 隔离系
  // 来自 loader-isolation，其余为本文档声明化。
  markers: {
  DS_TOOL_SCHEMA_SANITIZE_MARKER,
  PI_AI_TOOL_SCHEMA_SANITIZE_MARKER,
    SLOT_KEY_COMPAT_MARKER,
    SLOT_UNKEYED_COMPAT_MARKER,
    SLOT_ERROR_ISOLATE_MARKER,
    SLOT_ERROR_ISOLATE_MARKER_V2,
    PROFILE_PATCH_GUARD_MARKER,
    PROFILE_BUNDLE_GUARD_MARKER,
    PROFILE_BOOT_GUARD_MARKER,
    SETTINGS_SECTION_MARKER,
    PLUGIN_INVENTORY_TAB_MARKER,
    PERSISTENT_ABORT_RACE_MARKER,
    INTERRUPT_ESCALATION_MARKER,
    AGENT_PRESET_FALLBACK_MARKER,
    PROMPT_CONTEXT_LITERAL_MARKER,
    FALLBACK_HEAL_ISOLATION_MARKER,
    CREDENTIALS_INITIAL_RETRY_MARKER,
    CREDENTIALS_ABSENT_GUIDANCE_MARKER,
    DEVICE_AUTH_GUIDANCE_MARKER,
    KERNEL_BOOT_WATCHDOG_MARKER,
    WSL_PICKER_BROWSE_MARKER,
    ADAPTER_PREPARE_CALL_GUARD_MARKER,
    SESSION_HEADER_SCAN_MARKER,
    SESSION_LOAD_GRACEFUL_MARKER,
    MANUAL_SORT_DRAG_MARKER,
    CODEX_LOCAL_BIN_MARKER,
    CLAUDE_LOCAL_BIN_MARKER,
  PI_AI_4XX_DUMP_MARKER,
    SKILL_DIRS_COMPAT_MARKER,
    ...require('./loader-isolation').markers,
  },
};
