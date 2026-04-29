import { ThunderClient } from "../client"

export interface WeatherNow {
  temp: string
  feelsLike: string
  text: string
  windDir: string
  windScale: string
  humidity: string
  icon: string
  city: string
}

export class WeatherClient extends ThunderClient {
  async getNow(location: string): Promise<WeatherNow> {
    const res = await this.get<{ ok: boolean; data: WeatherNow }>(
      `/weather/now?location=${encodeURIComponent(location)}`
    )
    return res.data
  }
}
