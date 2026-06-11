export interface GeoPlace {
  name: string
  admin1?: string
  country?: string
  country_code?: string
  latitude: number
  longitude: number
}
export declare function geocode(location: string): Promise<GeoPlace>
