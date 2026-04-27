import { useMutation } from "@tanstack/react-query"
import { getReviews } from "../api/reviews/reviews"
import type { FetchAndAnalyzeRequest, FetchAndAnalyzeResponse } from "../api/models"

// Client-extended review type: backend fields + client-only fields
export interface Review {
  // Backend fields — kept exactly as-is from the API
  review_id: string
  user_name: string
  user_image: string
  content: string
  score: number
  thumbs_up_count: number
  review_created_version: string | null
  at: string
  reply_content: string | null
  replied_at: string | null
  app_version: string | null
  sentiment: "positive" | "neutral" | "negative"
  priority: "high" | "medium" | "low"

  // Client-only (not from backend)
  ai_response: string | null
  done: boolean
}

// Top-level response shape (stored in state)
export interface AnalysisData {
  app_id: string
  app_name: string
  total_analyzed: number
  reviews: Review[]
}

interface AnalyzeParams {
  url: string
  sentiment_instructions?: string
  priority_instructions?: string
}

export function useAnalyzeReviews() {
  return useMutation<AnalysisData, Error, AnalyzeParams>({
    mutationFn: async (params: AnalyzeParams) => {
      const request: FetchAndAnalyzeRequest = {
        url: params.url,
        sentiment_instructions: params.sentiment_instructions ?? "",
        priority_instructions: params.priority_instructions ?? "",
      }
      const api = getReviews()
      const data: FetchAndAnalyzeResponse = await api.fetchAndAnalyzeApiReviewsFetchAndAnalyzePost(request)
      // Append client-only fields to each review
      return {
        ...data,
        reviews: data.reviews.map((r) => ({
          ...r,
          ai_response: null,
          done: false,
        })),
      }
    },
  })
}
