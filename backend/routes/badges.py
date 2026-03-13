"""
badges.py -- Public verification badge endpoint for marketplace listings.

Returns badge data (JSON or SVG) based on an agent's eval score.
No auth required -- badges are public trust indicators.

Badge levels:
  - verified: score >= 80
  - tested:   score >= 60
  - unverified: no score or score < 60
"""
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from database import get_db
from fastapi import Depends

router = APIRouter(prefix="/api/badges", tags=["badges"])


def compute_badge_level(score) -> str:
    """Compute badge level from an eval score."""
    if score is None:
        return "unverified"
    if score >= 80:
        return "verified"
    if score >= 60:
        return "tested"
    return "unverified"


BADGE_COLORS = {
    "verified": {"bg": "#22c55e", "label": "Cane Verified"},
    "tested": {"bg": "#eab308", "label": "Cane Tested"},
    "unverified": {"bg": "#6b7280", "label": "Unverified"},
}


def _build_svg(level: str, score) -> str:
    """Build an SVG badge similar to shields.io style."""
    config = BADGE_COLORS.get(level, BADGE_COLORS["unverified"])
    bg = config["bg"]
    label = config["label"]
    score_text = f"{score:.0f}%" if score is not None else "N/A"

    label_width = len(label) * 7 + 12
    score_width = len(score_text) * 7 + 12
    total_width = label_width + score_width

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{total_width}" height="20">
  <linearGradient id="b" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="a">
    <rect width="{total_width}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#a)">
    <rect width="{label_width}" height="20" fill="#555"/>
    <rect x="{label_width}" width="{score_width}" height="20" fill="{bg}"/>
    <rect width="{total_width}" height="20" fill="url(#b)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
    <text x="{label_width / 2}" y="15" fill="#010101" fill-opacity=".3">{label}</text>
    <text x="{label_width / 2}" y="14">{label}</text>
    <text x="{label_width + score_width / 2}" y="15" fill="#010101" fill-opacity=".3">{score_text}</text>
    <text x="{label_width + score_width / 2}" y="14">{score_text}</text>
  </g>
</svg>"""


@router.get("/{listing_id}")
def get_badge(
    listing_id: str,
    format: str = Query("json", regex="^(json|svg)$"),
    db: Session = Depends(get_db),
):
    """
    Get the verification badge for a marketplace listing.
    Returns JSON by default, or an SVG image with ?format=svg.
    """
    from marketplace_models import MarketplaceListing

    listing = db.query(MarketplaceListing).filter(
        MarketplaceListing.id == listing_id,
        MarketplaceListing.status == "active",
    ).first()

    if not listing:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Listing not found")

    level = compute_badge_level(listing.overall_score)

    if format == "svg":
        svg = _build_svg(level, listing.overall_score)
        return Response(content=svg, media_type="image/svg+xml", headers={
            "Cache-Control": "public, max-age=300",
        })

    return {
        "badge": level,
        "score": listing.overall_score,
        "listing_name": listing.name,
        "test_case_count": listing.test_case_count,
        "clone_count": listing.clone_count,
        "badge_label": BADGE_COLORS.get(level, {}).get("label", "Unverified"),
        "last_evaluated": listing.updated_at.isoformat() if listing.updated_at else None,
    }
