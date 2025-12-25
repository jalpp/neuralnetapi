import { LichessData } from "./sanhelper.js"

const getRatingGroups = (elo: number): number[] => {
  if (elo <= 1200) return [1000, 1200]
  if (elo <= 1400) return [1200, 1400]
  if (elo <= 1600) return [1400, 1600]
  if (elo <= 1800) return [1600, 1800]
  if (elo <= 2000) return [1800, 2000]
  return [2000, 2200]
}

export const fetchLichessBook = async (
  fen: string,
  rating: number
): Promise<LichessData> => {
  const params = new URLSearchParams({
    variant: 'standard',
    fen,
    speeds: 'rapid,classical',
    ratings: getRatingGroups(rating).join(','),
    moves: '12',
  })

  const res = await fetch(
    `https://explorer.lichess.ovh/lichess?${params}`
  )

  if (!res.ok) {
    throw new Error(`Lichess error ${res.status}`)
  }

  return res.json()
}
