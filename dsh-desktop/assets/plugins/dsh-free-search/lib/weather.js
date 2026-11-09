// Weather（Open-Meteo：geocoding + forecast，全部免 key）
// 与 lib/index.js 的 weather 工具配套。这里同时导出 output schema 与 sanitizeWeatherResult()，
// 使 tools/assert-weather-contract.mjs 能离线校验「返回值 ↔ schema」逐字段对齐——
// 0.8.4/0.8.5 曾因 schema 漏声明 latitude/longitude/timezone/current.code/daily[].code
// 导致 additionalProperties:false 校验失败、工具 100% 不可用（issue #73）。

const OPEN_METEO_GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

// WMO weather code → 描述（中文/英文/日文）。
// 日文按日本气象厅「国際式の天気記号」的 ww 表（与 Open-Meteo 的 code 同一套编号）：
// https://www.jma.go.jp/jma/kishou/know/kurashi/symbols.html
// 「X，弱」→ 弱いX，「X，並」「X，並又は強」→ X，「X，強」→ 強いX，「激しい」→ 激しいX。
// 0–3 在 ww 表里是「云的变化」而非云量，按气象厅预报用语（快晴 / 晴れ / 曇り）与天气预报画面的
// 天気テロップ「晴時々曇 = PARTLY CLOUDY」对应。96/99 的强弱在 ww 表里指雷电而非冰雹。
const WMO_CODES = {
  0: ["晴", "Clear sky", "快晴"],
  1: ["大部晴朗", "Mainly clear", "晴れ"],
  2: ["多云", "Partly cloudy", "晴れ時々曇り"],
  3: ["阴", "Overcast", "曇り"],
  45: ["雾", "Fog", "霧"],
  48: ["雾凇", "Depositing rime fog", "霧（霧氷を伴う）"],
  51: ["毛毛雨（弱）", "Light drizzle", "弱い霧雨"],
  53: ["毛毛雨", "Moderate drizzle", "霧雨"],
  55: ["毛毛雨（强）", "Dense drizzle", "強い霧雨"],
  56: ["冻毛毛雨（弱）", "Light freezing drizzle", "弱い着氷性の霧雨"],
  57: ["冻毛毛雨（强）", "Dense freezing drizzle", "着氷性の霧雨"],
  61: ["小雨", "Slight rain", "弱い雨"],
  63: ["中雨", "Moderate rain", "雨"],
  65: ["大雨", "Heavy rain", "強い雨"],
  66: ["冻雨（弱）", "Light freezing rain", "弱い着氷性の雨"],
  67: ["冻雨（强）", "Heavy freezing rain", "着氷性の雨"],
  71: ["小雪", "Slight snow", "弱い雪"],
  73: ["中雪", "Moderate snow", "雪"],
  75: ["大雪", "Heavy snow", "強い雪"],
  77: ["雪粒", "Snow grains", "霧雪"],
  80: ["阵雨（弱）", "Slight rain showers", "弱いにわか雨"],
  81: ["阵雨", "Moderate rain showers", "にわか雨"],
  82: ["阵雨（强）", "Violent rain showers", "激しいにわか雨"],
  85: ["阵雪（弱）", "Slight snow showers", "弱いにわか雪"],
  86: ["阵雪（强）", "Heavy snow showers", "にわか雪"],
  95: ["雷暴", "Thunderstorm", "雷雨"],
  96: ["雷暴伴小冰雹", "Thunderstorm with slight hail", "雷雨（ひょうを伴う）"],
  99: ["雷暴伴大冰雹", "Thunderstorm with heavy hail", "激しい雷雨（ひょうを伴う）"],
};
const TEXT_LANGUAGES = ["zh", "en", "ja"];
const UNKNOWN_TEXT = { zh: "未知", en: "Unknown", ja: "不明" };

/** 天气文案有 zh / en / ja 三套；其它语言（ru/de/…）走英文，避免整段中文（#92）。 */
export function textLanguage(lang) {
  const tag = String(lang ?? "").trim().toLowerCase();
  return TEXT_LANGUAGES.includes(tag) ? tag : "en";
}

export function wmoText(code, lang) {
  const textLang = textLanguage(lang);
  const hit = WMO_CODES[code];
  if (!hit) return UNKNOWN_TEXT[textLang];
  return hit[TEXT_LANGUAGES.indexOf(textLang)] + ` (WMO ${code})`;
}

/** weather 工具的正文（render 用）。lang 同 textLanguage()，description 由 fetchWeather 按同一语言生成。 */
export function formatWeather(value, lang) {
  const textLang = textLanguage(lang);
  const c = value.current ?? {};
  const pp = (d, fmt) => (d.precipitationProbability !== undefined ? fmt(d.precipitationProbability) : "");
  const lines = [];
  if (textLang === "zh") {
    lines.push(`${value.location} 天气：`);
    lines.push(`当前：${c.temperature}°C（体感 ${c.apparent}°C），${c.text}，湿度 ${c.humidity}%，风速 ${c.wind} km/h`);
    for (const d of value.daily ?? []) lines.push(`${d.date}：${d.min}~${d.max}°C，${d.text}${pp(d, (p) => `，降水概率 ${p}%`)}`);
  } else if (textLang === "ja") {
    lines.push(`${value.location} の天気：`);
    lines.push(`現在：${c.temperature}°C（体感 ${c.apparent}°C）、${c.text}、湿度 ${c.humidity}%、風速 ${c.wind} km/h`);
    for (const d of value.daily ?? []) lines.push(`${d.date}：${d.min}〜${d.max}°C、${d.text}${pp(d, (p) => `、降水確率 ${p}%`)}`);
  } else {
    lines.push(`Weather for ${value.location}:`);
    lines.push(`Now: ${c.temperature}°C (feels ${c.apparent}°C), ${c.text}, humidity ${c.humidity}%, wind ${c.wind} km/h`);
    for (const d of value.daily ?? []) lines.push(`${d.date}: ${d.min}~${d.max}°C, ${d.text}${pp(d, (p) => `, precip ${p}%`)}`);
  }
  return lines.join("\n");
}

export async function geocodeLocation(name, signal, language = "en") {
  const params = new URLSearchParams({ name, count: "1", language: String(language ?? "en") || "en", format: "json" });
  const response = await fetch(`${OPEN_METEO_GEOCODING_URL}?${params}`, {
    method: "GET",
    redirect: "error",
    headers: { accept: "application/json", "user-agent": "deepseek-harness/free-search" },
    signal: AbortSignal.any([...(signal !== undefined ? [signal] : []), AbortSignal.timeout(15000)]),
  });
  if (!response.ok) throw new Error(`geocoding API error (HTTP ${response.status})`);
  const data = await response.json();
  const hit = data.results?.[0];
  if (!hit) return null;
  return {
    name: hit.name,
    admin: hit.admin1 ?? "",
    country: hit.country ?? "",
    latitude: hit.latitude,
    longitude: hit.longitude,
  };
}

export async function fetchWeather(location, days, lang, signal) {
  const geo = await geocodeLocation(location, signal, lang);
  if (!geo) throw new Error(`could not geocode location "${location}" — try a nearby larger city`);
  const params = new URLSearchParams({
    latitude: String(geo.latitude),
    longitude: String(geo.longitude),
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "auto",
    forecast_days: String(Math.min(Math.max(Number(days) || 3, 1), 7)),
  });
  const response = await fetch(`${OPEN_METEO_FORECAST_URL}?${params}`, {
    method: "GET",
    redirect: "error",
    headers: { accept: "application/json", "user-agent": "deepseek-harness/free-search" },
    signal: AbortSignal.any([...(signal !== undefined ? [signal] : []), AbortSignal.timeout(15000)]),
  });
  if (!response.ok) throw new Error(`forecast API error (HTTP ${response.status})`);
  const data = await response.json();
  const cur = data.current ?? {};
  const daily = data.daily ?? {};
  return {
    location: [geo.name, geo.admin, geo.country].filter(Boolean).join(", "),
    latitude: geo.latitude,
    longitude: geo.longitude,
    current: {
      temperature: cur.temperature_2m,
      apparent: cur.apparent_temperature,
      humidity: cur.relative_humidity_2m,
      wind: cur.wind_speed_10m,
      code: cur.weather_code,
      text: wmoText(cur.weather_code, lang),
    },
    daily: (daily.time ?? []).map((date, i) => ({
      date,
      min: daily.temperature_2m_min?.[i],
      max: daily.temperature_2m_max?.[i],
      code: daily.weather_code?.[i],
      text: wmoText(daily.weather_code?.[i], lang),
      precipitationProbability: daily.precipitation_probability_max?.[i],
    })),
    timezone: data.timezone ?? "",
  };
}

// weather 工具的 output schema。与 fetchWeather 返回值逐字段对齐：
// 任何一边增删字段都必须同步，否则 additionalProperties:false 会让工具调用失败（#73）。
export const WEATHER_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    location: { type: "string" },
    latitude: { type: "number" },
    longitude: { type: "number" },
    timezone: { type: "string" },
    current: {
      type: "object",
      additionalProperties: false,
      properties: {
        temperature: { type: "number" },
        apparent: { type: "number" },
        humidity: { type: "number" },
        wind: { type: "number" },
        code: { type: "number" },
        text: { type: "string" },
      },
    },
    daily: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          date: { type: "string" },
          min: { type: "number" },
          max: { type: "number" },
          code: { type: "number" },
          text: { type: "string" },
          precipitationProbability: { type: "number" },
        },
      },
    },
  },
};

// lossless JSON 不允许 undefined 字段：按"存在且有值"构造对象（与其它工具的做法一致）。
export function sanitizeWeatherResult(r) {
  return {
    location: r.location,
    ...(r.latitude !== undefined ? { latitude: r.latitude } : {}),
    ...(r.longitude !== undefined ? { longitude: r.longitude } : {}),
    ...(r.timezone ? { timezone: r.timezone } : {}),
    current: {
      ...(r.current?.temperature !== undefined ? { temperature: r.current.temperature } : {}),
      ...(r.current?.apparent !== undefined ? { apparent: r.current.apparent } : {}),
      ...(r.current?.humidity !== undefined ? { humidity: r.current.humidity } : {}),
      ...(r.current?.wind !== undefined ? { wind: r.current.wind } : {}),
      ...(r.current?.code !== undefined ? { code: r.current.code } : {}),
      ...(r.current?.text ? { text: r.current.text } : {}),
    },
    daily: (r.daily ?? []).map((d) => ({
      date: d.date,
      ...(d.min !== undefined ? { min: d.min } : {}),
      ...(d.max !== undefined ? { max: d.max } : {}),
      ...(d.code !== undefined ? { code: d.code } : {}),
      ...(d.text ? { text: d.text } : {}),
      ...(d.precipitationProbability !== undefined ? { precipitationProbability: d.precipitationProbability } : {}),
    })),
  };
}
