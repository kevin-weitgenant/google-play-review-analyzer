import { useState } from "react"
import { useAnalyzeReviews } from "../hooks/useAnalyzeReviews"
import type { Review, AnalysisData } from "../hooks/useAnalyzeReviews"

type Sentiment = "positive" | "neutral" | "negative"
type Priority = "high" | "medium" | "low"

interface AIConfig {
  priorityRules: string
  responseGuidelines: string
  tone: "formal" | "informal" | "tecnico"
  language: string
}

const DEFAULT_CONFIG: AIConfig = {
  priorityRules:
    "Marque como Urgente reviews com 1 estrela que mencionem erros críticos, falhas de login, perda de dados ou crashes. Marque como Alta reviews com 1-2 estrelas com reclamações recorrentes ou bugs confirmados. Marque como Normal todas as demais.",
  responseGuidelines:
    "Sempre inicie pelo nome do usuário. Reconheça o feedback antes de qualquer explicação. Seja empático e direto. Evite respostas genéricas. Se for um problema técnico, mencione que a equipe foi notificada.",
  tone: "formal",
  language: "Português brasileiro",
}

const SENTIMENT_LABELS: Record<Sentiment, string> = {
  positive: "Positivo",
  neutral: "Neutro",
  negative: "Negativo",
}

const PRIORITY_LABELS: Record<Priority, string> = {
  high: "Urgente",
  medium: "Alta",
  low: "Normal",
}

const COLUMN_CONFIG: Record<Sentiment, {
  label: string
  bg: string
  border: string
  headerBg: string
  headerText: string
  dot: string
  cardBorder: string
}> = {
  positive: {
    label: "Positivo",
    bg: "#F0FDF4",
    border: "#86EFAC",
    headerBg: "#DCFCE7",
    headerText: "#15803D",
    dot: "#16A34A",
    cardBorder: "#BBF7D0",
  },
  neutral: {
    label: "Neutro",
    bg: "#F9FAFB",
    border: "#D1D5DB",
    headerBg: "#F3F4F6",
    headerText: "#374151",
    dot: "#9CA3AF",
    cardBorder: "#E5E7EB",
  },
  negative: {
    label: "Negativo",
    bg: "#FFF5F5",
    border: "#FCA5A5",
    headerBg: "#FEE2E2",
    headerText: "#B91C1C",
    dot: "#EF4444",
    cardBorder: "#FECACA",
  },
}

const PRIORITY_CONFIG: Record<Priority, { text: string; bg: string; stripe: string; label: string }> = {
  high:   { text: "#991B1B", bg: "#FEE2E2", stripe: "#EF4444", label: "Urgente" },
  medium: { text: "#92400E", bg: "#FEF3C7", stripe: "#F59E0B", label: "Alta" },
  low:    { text: "#166534", bg: "#DCFCE7", stripe: "#86EFAC", label: "Normal" },
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
  return `${d.getDate()} ${months[d.getMonth()]}`
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

// TODO: Replace with real AI response endpoint when backend implements it
function simulateAIResponse(review: Review, config: AIConfig): Promise<string> {
  return new Promise((resolve) => {
    const firstName = review.user_name.split(" ")[0]
    setTimeout(() => {
      resolve(
        `Olá, ${firstName}! Obrigado pelo seu feedback. Sua opinião é muito importante para nós e estamos trabalhando para melhorar continuamente.`
      )
    }, 1400)
  })
}

export function DesignKanban() {
  const [step, setStep] = useState<"input" | "board">("input")
  const [link, setLink] = useState("")
  const [reviews, setReviews] = useState<Review[]>([])
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<Sentiment | null>(null)
  const [openCard, setOpenCard] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [editedResponses, setEditedResponses] = useState<Record<string, string>>({})
  const [showConfig, setShowConfig] = useState(false)
  const [config, setConfig] = useState<AIConfig>(DEFAULT_CONFIG)
  const [configDraft, setConfigDraft] = useState<AIConfig>(DEFAULT_CONFIG)

  const { mutateAsync: analyze, isPending, error: analyzeError } = useAnalyzeReviews()

  const columns = ["positive", "neutral", "negative"] as const

  const handleAnalyze = async () => {
    try {
      const data = await analyze({
        url: link,
        sentiment_instructions: config.responseGuidelines,
        priority_instructions: config.priorityRules,
      })
      setAnalysisData(data)
      setReviews(data.reviews)
      setStep("board")
    } catch {
      // error is already captured by the mutation
    }
  }

  const handleDragStart = (id: string) => setDragging(id)
  const handleDragOver = (e: React.DragEvent, col: Sentiment) => {
    e.preventDefault()
    setOver(col)
  }
  const handleDrop = (col: Sentiment) => {
    if (dragging !== null) {
      setReviews((prev) => prev.map((r) => (r.review_id === dragging ? { ...r, sentiment: col } : r)))
    }
    setDragging(null)
    setOver(null)
  }

  const openReview = reviews.find((r) => r.review_id === openCard)

  const totals = {
    positive: reviews.filter((r) => r.sentiment === "positive").length,
    negative: reviews.filter((r) => r.sentiment === "negative").length,
    neutral: reviews.filter((r) => r.sentiment === "neutral").length,
  }

  const handleMarkDone = (id: string) => {
    setReviews((prev) => prev.map((r) => (r.review_id === id ? { ...r, done: true } : r)))
    setOpenCard(null)
  }

  const handleCopy = () => {
    if (!openReview) return
    const text = editedResponses[openReview.review_id] ?? openReview.ai_response ?? ""
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleGenerateResponse = async (reviewId: string) => {
    const review = reviews.find((r) => r.review_id === reviewId)
    if (!review) return
    setGeneratingId(reviewId)
    const generated = await simulateAIResponse(review, config)
    setReviews((prev) => prev.map((r) => (r.review_id === reviewId ? { ...r, ai_response: generated } : r)))
    setGeneratingId(null)
  }

  const handleSaveConfig = () => {
    setConfig(configDraft)
    setShowConfig(false)
  }

  const handleCancelConfig = () => {
    setConfigDraft(config)
    setShowConfig(false)
  }

  const responseText = openReview
    ? (editedResponses[openReview.review_id] ?? openReview.ai_response ?? "")
    : ""

  return (
    <div
      style={{
        background: "#F8F9FA",
        color: "#111827",
        fontFamily: "'Geist', sans-serif",
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "white",
          borderBottom: "1px solid #E5E7EB",
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "#111827",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="7" height="18" rx="2" fill="white" opacity="0.9" />
              <rect x="14" y="3" width="7" height="11" rx="2" fill="white" opacity="0.6" />
            </svg>
          </div>
          <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: "-0.4px" }}>ReviewFlow</span>
          {analysisData && (
            <span style={{ fontSize: 12, color: "#6B7280", marginLeft: 8 }}>
              {analysisData.app_name} · {analysisData.total_analyzed} reviews
            </span>
          )}
        </div>

        {step === "board" && (
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {columns.map((col) => {
              const c = COLUMN_CONFIG[col]
              return (
                <div key={col} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.dot }} />
                  <span style={{ fontSize: 12, color: "#6B7280" }}>
                    {totals[col]} {SENTIMENT_LABELS[col].toLowerCase()}
                  </span>
                </div>
              )
            })}

            {/* Config button */}
            <button
              onClick={() => { setConfigDraft(config); setShowConfig(true) }}
              title="Configurar IA"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                padding: "5px 12px",
                borderRadius: 6,
                border: "1px solid #E5E7EB",
                background: "white",
                color: "#374151",
                cursor: "pointer",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Configurar IA
            </button>

            <button
              onClick={() => {
                setStep("input")
                setAnalysisData(null)
                setReviews([])
                setLink("")
              }}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: "5px 12px",
                borderRadius: 6,
                border: "1px solid #E5E7EB",
                background: "white",
                color: "#374151",
                cursor: "pointer",
              }}
            >
              Novo app
            </button>
          </div>
        )}
      </div>

      {/* Input hero */}
      {step === "input" && (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "40px 24px",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#9CA3AF",
              marginBottom: 14,
            }}
          >
            Google Play Review Analyzer
          </div>
          <h1
            style={{
              fontSize: 36,
              fontWeight: 900,
              letterSpacing: "-1.5px",
              marginBottom: 12,
              textAlign: "center",
              lineHeight: 1.15,
            }}
          >
            Analise reviews.
            <br />
            <span style={{ color: "#9CA3AF" }}>Responda melhor.</span>
          </h1>
          <p style={{ fontSize: 15, color: "#6B7280", marginBottom: 36, textAlign: "center", maxWidth: 420, lineHeight: 1.6 }}>
            Cole o link do seu app na Google Play Store e a IA vai classificar, priorizar e sugerir respostas para cada review.
          </p>

          {analyzeError && (
            <div style={{ color: "#DC2626", fontSize: 13, marginBottom: 12, maxWidth: 560, textAlign: "center" }}>
              Erro ao analisar: {analyzeError.message}
            </div>
          )}

          <div style={{ width: "100%", maxWidth: 560, display: "flex", gap: 10 }}>
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://play.google.com/store/apps/details?id=..."
              disabled={isPending}
              style={{
                flex: 1,
                padding: "13px 16px",
                borderRadius: 10,
                border: "2px solid #E5E7EB",
                fontSize: 14,
                outline: "none",
                color: "#111827",
                background: "white",
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => (e.target.style.borderColor = "#111827")}
              onBlur={(e) => (e.target.style.borderColor = "#E5E7EB")}
            />
            <button
              onClick={handleAnalyze}
              disabled={isPending || !link.trim()}
              style={{
                padding: "13px 24px",
                borderRadius: 10,
                border: "none",
                background: isPending ? "#9CA3AF" : "#111827",
                color: "white",
                fontSize: 14,
                fontWeight: 700,
                cursor: isPending ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {isPending ? (
                <>
                  <SpinnerIcon />
                  Analisando...
                </>
              ) : (
                "Analisar agora"
              )}
            </button>
          </div>

          <div style={{ display: "flex", gap: 28, marginTop: 40 }}>
            {[
              { label: "Classificacao por IA" },
              { label: "Priorizacao automatica" },
              { label: "Respostas sugeridas" },
            ].map((f) => (
              <div key={f.label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "#9CA3AF", fontWeight: 500 }}>{f.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Kanban board */}
      {step === "board" && (
        <div style={{ flex: 1, display: "flex", gap: 12, padding: "20px", overflowX: "auto", alignItems: "flex-start" }}>
          {columns.map((col) => {
            const c = COLUMN_CONFIG[col]
            const colReviews = reviews.filter((r) => r.sentiment === col)
            const isOver = over === col

            return (
              <div
                key={col}
                onDragOver={(e) => handleDragOver(e, col)}
                onDrop={() => handleDrop(col)}
                onDragLeave={() => setOver(null)}
                style={{
                  flex: "1 1 0",
                  minWidth: 240,
                  borderRadius: 14,
                  background: isOver ? c.bg : "#F3F4F6",
                  border: `2px dashed ${isOver ? c.dot : "transparent"}`,
                  transition: "all 0.15s",
                  overflow: "hidden",
                }}
              >
                {/* Column header */}
                <div
                  style={{
                    padding: "12px 16px",
                    background: c.headerBg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.dot }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: c.headerText }}>{c.label}</span>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: "rgba(0,0,0,0.08)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: c.headerText,
                    }}
                  >
                    {colReviews.length}
                  </span>
                </div>

                {/* Cards */}
                <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {colReviews.map((r) => {
                    const p = PRIORITY_CONFIG[r.priority]
                    return (
                      <div
                        key={r.review_id}
                        draggable
                        onDragStart={() => handleDragStart(r.review_id)}
                        onClick={() => setOpenCard(r.review_id)}
                        style={{
                          background: "white",
                          borderRadius: 10,
                          border: `1px solid ${c.cardBorder}`,
                          cursor: "grab",
                          opacity: r.done ? 0.48 : 1,
                          transition: "all 0.1s",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                          display: "flex",
                          overflow: "hidden",
                        }}
                      >
                        {/* Priority stripe */}
                        <div
                          style={{
                            width: 4,
                            flexShrink: 0,
                            background: p.stripe,
                            borderRadius: "10px 0 0 10px",
                          }}
                        />
                        <div style={{ flex: 1, padding: "12px 12px 10px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 7 }}>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <div
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: "50%",
                                  background: c.headerBg,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  fontSize: 9,
                                  fontWeight: 800,
                                  color: c.headerText,
                                  flexShrink: 0,
                                  overflow: "hidden",
                                }}
                              >
                                <img
                                  src={r.user_image}
                                  alt=""
                                  style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }}
                                  onError={(e) => {
                                    const img = e.currentTarget
                                    img.style.display = "none"
                                    const parent = img.parentElement
                                    if (parent) parent.textContent = getInitials(r.user_name)
                                  }}
                                />
                              </div>
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>{r.user_name}</div>
                                <div style={{ display: "flex", gap: 1 }}>
                                  {Array.from({ length: 5 }).map((_, i) => (
                                    <span key={i} style={{ fontSize: 9, color: i < r.score ? "#F59E0B" : "#E5E7EB" }}>
                                      ★
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                              {r.priority !== "low" && (
                                <span
                                  style={{
                                    fontSize: 9,
                                    fontWeight: 700,
                                    padding: "2px 6px",
                                    borderRadius: 4,
                                    background: p.bg,
                                    color: p.text,
                                    letterSpacing: "0.02em",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  {p.label}
                                </span>
                              )}
                              {r.done && (
                                <span style={{ fontSize: 9, color: "#9CA3AF", fontWeight: 600 }}>Respondido</span>
                              )}
                            </div>
                          </div>
                          <p
                            style={{
                              fontSize: 12,
                              color: "#6B7280",
                              lineHeight: 1.5,
                              margin: "0 0 7px",
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }}
                          >
                            {r.content}
                          </p>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              {r.thumbs_up_count > 0 && (
                                <span style={{ fontSize: 10, color: "#9CA3AF", display: "flex", alignItems: "center", gap: 2 }}>
                                  👍 {r.thumbs_up_count}
                                </span>
                              )}
                              {r.reply_content && (
                                <span style={{ fontSize: 10, color: "#9CA3AF" }}>💬</span>
                              )}
                            </div>
                            <span style={{ fontSize: 10, color: "#D1D5DB" }}>{formatDate(r.at)}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {colReviews.length === 0 && (
                    <div
                      style={{
                        padding: "28px 16px",
                        textAlign: "center",
                        color: "#D1D5DB",
                        fontSize: 12,
                        borderRadius: 8,
                        border: "2px dashed #E5E7EB",
                      }}
                    >
                      Solte reviews aqui
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Review drawer */}
      {openCard && openReview && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.3)",
            display: "flex",
            justifyContent: "flex-end",
            zIndex: 50,
          }}
          onClick={() => setOpenCard(null)}
        >
          <div
            style={{
              width: 440,
              background: "white",
              height: "100%",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 0,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Priority accent bar at top of drawer */}
            <div
              style={{
                height: 4,
                background: PRIORITY_CONFIG[openReview.priority].stripe,
                flexShrink: 0,
              }}
            />

            <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 20, flex: 1 }}>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>{openReview.user_name}</div>
                  <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span key={i} style={{ color: i < openReview.score ? "#F59E0B" : "#E5E7EB" }}>★</span>
                    ))}
                    <span style={{ fontSize: 12, color: "#9CA3AF", marginLeft: 6 }}>{formatDate(openReview.at)}</span>
                  </div>
                </div>
                <button
                  onClick={() => setOpenCard(null)}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9CA3AF", padding: 0, lineHeight: 1 }}
                >
                  ×
                </button>
              </div>

              {/* Review meta: app version, thumbs up */}
              <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#6B7280" }}>
                {openReview.app_version && (
                  <span>v{openReview.app_version}</span>
                )}
                {openReview.thumbs_up_count > 0 && (
                  <span>👍 {openReview.thumbs_up_count} pessoa(s) acharam útil</span>
                )}
              </div>

              {/* Sentiment + priority badges */}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "4px 12px",
                    borderRadius: 20,
                    background: COLUMN_CONFIG[openReview.sentiment].headerBg,
                    color: COLUMN_CONFIG[openReview.sentiment].headerText,
                  }}
                >
                  {SENTIMENT_LABELS[openReview.sentiment]}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "4px 12px",
                    borderRadius: 20,
                    background: PRIORITY_CONFIG[openReview.priority].bg,
                    color: PRIORITY_CONFIG[openReview.priority].text,
                  }}
                >
                  Prioridade {PRIORITY_LABELS[openReview.priority]}
                </span>
              </div>

              {/* Review text */}
              <div style={{ background: "#F9FAFB", borderRadius: 10, padding: "14px 16px", border: "1px solid #E5E7EB" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                  Review
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.7, color: "#374151", margin: 0 }}>{openReview.content}</p>
              </div>

              {/* Developer reply (if exists) */}
              {openReview.reply_content && (
                <div style={{ background: "#EFF6FF", borderRadius: 10, padding: "14px 16px", border: "1px solid #BFDBFE" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#3B82F6", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                    Resposta do desenvolvedor
                    {openReview.replied_at && (
                      <span style={{ textTransform: "none", color: "#93C5FD", marginLeft: 8, fontWeight: 400 }}>
                        {formatDate(openReview.replied_at)}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 13, lineHeight: 1.6, color: "#1E40AF", margin: 0 }}>{openReview.reply_content}</p>
                </div>
              )}

              {/* Suggested response section */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Resposta sugerida
                  </div>
                  {openReview.ai_response && (
                    <button
                      onClick={handleCopy}
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "3px 10px",
                        borderRadius: 6,
                        border: "1px solid #E5E7EB",
                        background: "white",
                        color: copied ? "#16A34A" : "#6B7280",
                        cursor: "pointer",
                      }}
                    >
                      {copied ? "Copiado!" : "Copiar"}
                    </button>
                  )}
                </div>

                {openReview.ai_response ? (
                  <textarea
                    value={editedResponses[openReview.review_id] ?? openReview.ai_response}
                    onChange={(e) =>
                      setEditedResponses((prev) => ({ ...prev, [openReview.review_id]: e.target.value }))
                    }
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      border: "1px solid #E5E7EB",
                      borderRadius: 10,
                      fontSize: 14,
                      lineHeight: 1.7,
                      color: "#374151",
                      outline: "none",
                      resize: "vertical",
                      minHeight: 110,
                      fontFamily: "inherit",
                      boxSizing: "border-box",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      border: "1.5px dashed #E5E7EB",
                      borderRadius: 10,
                      padding: "24px 20px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 12,
                      background: "#FAFAFA",
                    }}
                  >
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
                        Nenhuma resposta gerada ainda
                      </div>
                      <div style={{ fontSize: 12, color: "#9CA3AF", lineHeight: 1.5 }}>
                        Clique no botao abaixo para gerar uma resposta com IA baseada nas suas configuracoes.
                      </div>
                    </div>
                    <button
                      onClick={() => handleGenerateResponse(openReview.review_id)}
                      disabled={generatingId === openReview.review_id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        padding: "9px 18px",
                        borderRadius: 8,
                        border: "none",
                        background: generatingId === openReview.review_id ? "#E5E7EB" : "#111827",
                        color: generatingId === openReview.review_id ? "#9CA3AF" : "white",
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: generatingId === openReview.review_id ? "not-allowed" : "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      {generatingId === openReview.review_id ? (
                        <>
                          <SpinnerIcon />
                          Gerando...
                        </>
                      ) : (
                        <>
                          <SparkleIcon />
                          Gerar resposta com IA
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Regenerate button (when response already exists) */}
                {openReview.ai_response && (
                  <button
                    onClick={() => {
                      setReviews((prev) => prev.map((r) => (r.review_id === openReview.review_id ? { ...r, ai_response: null } : r)))
                      setEditedResponses((prev) => {
                        const next = { ...prev }
                        delete next[openReview.review_id]
                        return next
                      })
                      handleGenerateResponse(openReview.review_id)
                    }}
                    disabled={generatingId === openReview.review_id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginTop: 8,
                      padding: "6px 12px",
                      borderRadius: 6,
                      border: "1px solid #E5E7EB",
                      background: "white",
                      color: "#6B7280",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <SparkleIcon size={12} />
                    Regenerar
                  </button>
                )}
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 10, marginTop: "auto", paddingTop: 8 }}>
                <button
                  onClick={() => handleMarkDone(openReview.review_id)}
                  disabled={!openReview.ai_response}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: 8,
                    border: "none",
                    background: openReview.ai_response ? "#111827" : "#E5E7EB",
                    color: openReview.ai_response ? "white" : "#9CA3AF",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: openReview.ai_response ? "pointer" : "not-allowed",
                    transition: "all 0.15s",
                  }}
                >
                  Marcar como respondido
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Config modal */}
      {showConfig && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
            padding: 24,
          }}
          onClick={handleCancelConfig}
        >
          <div
            style={{
              background: "white",
              borderRadius: 16,
              width: "100%",
              maxWidth: 560,
              padding: "32px",
              display: "flex",
              flexDirection: "column",
              gap: 24,
              boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Configurar IA</div>
                <div style={{ fontSize: 13, color: "#6B7280", lineHeight: 1.5 }}>
                  Defina como a IA deve priorizar reviews e gerar respostas.
                </div>
              </div>
              <button
                onClick={handleCancelConfig}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#9CA3AF", padding: 0 }}
              >
                ×
              </button>
            </div>

            {/* Priority rules */}
            <div>
              <label
                style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}
              >
                Regras de prioridade
              </label>
              <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 8, lineHeight: 1.5 }}>
                Descreva quando a IA deve marcar como Urgente, Alta ou Normal.
              </div>
              <textarea
                value={configDraft.priorityRules}
                onChange={(e) => setConfigDraft((prev) => ({ ...prev, priorityRules: e.target.value }))}
                rows={4}
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  border: "1.5px solid #E5E7EB",
                  borderRadius: 8,
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: "#374151",
                  outline: "none",
                  resize: "vertical",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                  transition: "border-color 0.15s",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#111827")}
                onBlur={(e) => (e.target.style.borderColor = "#E5E7EB")}
              />
            </div>

            {/* Response guidelines */}
            <div>
              <label
                style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}
              >
                Diretrizes de resposta
              </label>
              <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 8, lineHeight: 1.5 }}>
                Como a IA deve estruturar e personalizar cada resposta.
              </div>
              <textarea
                value={configDraft.responseGuidelines}
                onChange={(e) => setConfigDraft((prev) => ({ ...prev, responseGuidelines: e.target.value }))}
                rows={4}
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  border: "1.5px solid #E5E7EB",
                  borderRadius: 8,
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: "#374151",
                  outline: "none",
                  resize: "vertical",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                  transition: "border-color 0.15s",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#111827")}
                onBlur={(e) => (e.target.style.borderColor = "#E5E7EB")}
              />
            </div>

            {/* Tone + Language */}
            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <label
                  style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}
                >
                  Tom de voz
                </label>
                <select
                  value={configDraft.tone}
                  onChange={(e) =>
                    setConfigDraft((prev) => ({ ...prev, tone: e.target.value as AIConfig["tone"] }))
                  }
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1.5px solid #E5E7EB",
                    borderRadius: 8,
                    fontSize: 13,
                    color: "#374151",
                    outline: "none",
                    background: "white",
                    fontFamily: "inherit",
                    cursor: "pointer",
                  }}
                >
                  <option value="formal">Formal</option>
                  <option value="informal">Informal</option>
                  <option value="tecnico">Tecnico</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label
                  style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}
                >
                  Idioma
                </label>
                <select
                  value={configDraft.language}
                  onChange={(e) => setConfigDraft((prev) => ({ ...prev, language: e.target.value }))}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1.5px solid #E5E7EB",
                    borderRadius: 8,
                    fontSize: 13,
                    color: "#374151",
                    outline: "none",
                    background: "white",
                    fontFamily: "inherit",
                    cursor: "pointer",
                  }}
                >
                  <option value="Português brasileiro">Portugues brasileiro</option>
                  <option value="Inglês">Ingles</option>
                  <option value="Espanhol">Espanhol</option>
                </select>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={handleCancelConfig}
                style={{
                  flex: 1,
                  padding: "11px",
                  borderRadius: 8,
                  border: "1.5px solid #E5E7EB",
                  background: "white",
                  color: "#374151",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveConfig}
                style={{
                  flex: 2,
                  padding: "11px",
                  borderRadius: 8,
                  border: "none",
                  background: "#111827",
                  color: "white",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Salvar configuracoes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SparkleIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      style={{ animation: "spin 0.8s linear infinite" }}
    >
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}
