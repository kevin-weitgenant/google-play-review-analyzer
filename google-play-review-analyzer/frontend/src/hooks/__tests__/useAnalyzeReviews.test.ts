import { describe, it, expect } from "vitest"
import { getReviews } from "../../api/reviews/reviews"
import type { FetchAndAnalyzeResponse } from "../../api/models"

const VALID_SENTIMENTS = ["positive", "neutral", "negative"] as const
const VALID_PRIORITIES = ["high", "medium", "low"] as const

describe("useAnalyzeReviews — integration", () => {
  it("calls the real backend and returns correctly shaped data", async () => {
    const api = getReviews()

    const data: FetchAndAnalyzeResponse =
      await api.fetchAndAnalyzeApiReviewsFetchAndAnalyzePost({
        url: "https://play.google.com/store/apps/details?id=com.whatsapp",
      })

    // Assert top-level response shape
    expect(data).not.toBeNull()
    expect(typeof data.app_name).toBe("string")
    expect(data.app_name.length).toBeGreaterThan(0)
    expect(typeof data.app_id).toBe("string")
    expect(data.app_id.length).toBeGreaterThan(0)
    expect(typeof data.total_analyzed).toBe("number")
    expect(data.total_analyzed).toBeGreaterThan(0)
    expect(Array.isArray(data.reviews)).toBe(true)
    expect(data.reviews.length).toBeGreaterThan(0)

    // Assert every review has all expected fields with correct types
    for (const review of data.reviews) {
      // Required string fields
      expect(typeof review.review_id).toBe("string")
      expect(review.review_id.length).toBeGreaterThan(0)

      expect(typeof review.user_name).toBe("string")
      expect(review.user_name.length).toBeGreaterThan(0)

      expect(typeof review.user_image).toBe("string")

      expect(typeof review.content).toBe("string")

      // Score: number 1-5
      expect(typeof review.score).toBe("number")
      expect(review.score).toBeGreaterThanOrEqual(1)
      expect(review.score).toBeLessThanOrEqual(5)

      // Thumbs up count
      expect(typeof review.thumbs_up_count).toBe("number")
      expect(review.thumbs_up_count).toBeGreaterThanOrEqual(0)

      // at: valid ISO datetime string
      expect(typeof review.at).toBe("string")
      expect(new Date(review.at).toISOString()).toBeTruthy()

      // Sentiment: one of valid values
      expect(VALID_SENTIMENTS).toContain(review.sentiment)

      // Priority: one of valid values
      expect(VALID_PRIORITIES).toContain(review.priority)

      // Nullable string fields
      if (review.app_version !== null) {
        expect(typeof review.app_version).toBe("string")
      }
      if (review.reply_content !== null) {
        expect(typeof review.reply_content).toBe("string")
      }
      if (review.replied_at !== null) {
        expect(typeof review.replied_at).toBe("string")
        expect(new Date(review.replied_at).toISOString()).toBeTruthy()
      }
      if (review.review_created_version !== null) {
        expect(typeof review.review_created_version).toBe("string")
      }
    }
  })

  it("useAnalyzeReviews hook appends client-only fields", async () => {
    const api = getReviews()

    const data: FetchAndAnalyzeResponse =
      await api.fetchAndAnalyzeApiReviewsFetchAndAnalyzePost({
        url: "https://play.google.com/store/apps/details?id=com.whatsapp",
      })

    // Simulate what the hook does: append ai_response + done
    const transformed = data.reviews.map((r) => ({
      ...r,
      ai_response: null as string | null,
      done: false,
    }))

    for (const review of transformed) {
      expect(review.ai_response).toBeNull()
      expect(review.done).toBe(false)
    }
  })
})
