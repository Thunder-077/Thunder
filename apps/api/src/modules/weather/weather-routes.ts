import { Hono } from "hono"
import { importPKCS8, SignJWT } from "jose"
import { apiSuccess, apiError } from "@thunder/contracts"

type WeatherEnv = {
  QWEATHER_API_HOST?: string
  QWEATHER_PRIVATE_KEY?: string
  QWEATHER_KEY_ID?: string
  QWEATHER_PROJECT_ID?: string
}

interface QWeatherNowResponse {
  code: string
  now: {
    temp: string
    feelsLike: string
    text: string
    windDir: string
    windScale: string
    humidity: string
    icon: string
  }
  location?: {
    name: string[]
    id: string[]
    lat: string[]
    lon: string[]
  }
}

function getWeatherEnv(bindings?: WeatherEnv) {
  // Desktop sidecars read process.env; Cloudflare Workers expose bindings on c.env.
  // Resolve per request so runtime config changes are picked up after process restart.
  return {
    host: bindings?.QWEATHER_API_HOST || process.env.QWEATHER_API_HOST || "nb33jqkfhv.re.qweatherapi.com",
    privateKey: (bindings?.QWEATHER_PRIVATE_KEY || process.env.QWEATHER_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    keyId: bindings?.QWEATHER_KEY_ID || process.env.QWEATHER_KEY_ID || "",
    projectId: bindings?.QWEATHER_PROJECT_ID || process.env.QWEATHER_PROJECT_ID || "",
  }
}

async function getQWeatherToken(env: ReturnType<typeof getWeatherEnv>): Promise<string> {
  if (!env.privateKey || !env.keyId || !env.projectId) {
    throw new Error("和风天气 JWT 配置不完整")
  }

  const privateKey = await importPKCS8(env.privateKey, "EdDSA")
  const iat = Math.floor(Date.now() / 1000) - 30
  const exp = iat + 900

  const token = await new SignJWT({
    sub: env.projectId,
    iat,
    exp,
  })
    .setProtectedHeader({
      alg: "EdDSA",
      kid: env.keyId,
    })
    .sign(privateKey)

  return token
}

const weather = new Hono()

weather.get("/now", async (c) => {
  try {
    const location = c.req.query("location")
    if (!location) {
      return c.json(apiError("WEATHER_MISSING_LOCATION", "缺少 location 参数"), 400)
    }

    const weatherEnv = getWeatherEnv(c.env as WeatherEnv | undefined)
    const token = await getQWeatherToken(weatherEnv)
    const url = `https://${weatherEnv.host}/v7/weather/now?location=${encodeURIComponent(location)}&lang=zh`
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!res.ok) {
      console.error("[weather-api] QWeather API error", res.status)
      return c.json(apiError("WEATHER_UPSTREAM_ERROR", "天气服务暂时不可用"), 502)
    }

    const data: QWeatherNowResponse = await res.json()
    if (data.code !== "200") {
      console.error("[weather-api] QWeather code", data.code)
      return c.json(apiError("WEATHER_UPSTREAM_ERROR", "获取天气数据失败"), 502)
    }

    const cityName = data.location?.name?.[0] || location

    return c.json(
      apiSuccess({
        temp: data.now.temp,
        feelsLike: data.now.feelsLike,
        text: data.now.text,
        windDir: data.now.windDir,
        windScale: data.now.windScale,
        humidity: data.now.humidity,
        icon: data.now.icon,
        city: cityName,
      })
    )
  } catch (error) {
    console.error("[weather-api] GET /now failed", error)
    return c.json(apiError("INTERNAL_ERROR", "获取天气信息失败"), 500)
  }
})

export { weather }
