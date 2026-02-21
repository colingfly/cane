"""
marketplace_routes.py — API endpoints for the Agent Marketplace.

Endpoints:
  GET    /api/marketplace              — browse listings (public, no auth required)
  GET    /api/marketplace/:id          — listing detail with performance card
  POST   /api/marketplace/publish      — publish an agent to marketplace
  POST   /api/marketplace/:id/clone    — clone a listing into your workspace
  DELETE /api/marketplace/:id          — delist (publisher only)
"""
import json
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_user
from db_models import User, Workspace, Document, Tenant
from eval_models import Environment, TestCase, JudgeCriteria, JudgeCustomRule, EvalRun, EvalResult
from marketplace_models import MarketplaceListing, MarketplaceClone

router = APIRouter(prefix="/api/marketplace", tags=["marketplace"])


def _listing_to_dict(l: MarketplaceListing, detail=False) -> dict:
    """Serialize a listing for API response."""
    d = {
        "id": l.id,
        "name": l.name,
        "description": l.description,
        "icon": l.icon or "",
        "agent_type": l.agent_type,
        "category": l.category,
        "tags": json.loads(l.tags or "[]"),
        "pack_type": l.pack_type,
        "overall_score": l.overall_score,
        "test_case_count": l.test_case_count,
        "document_count": l.document_count,
        "clone_count": l.clone_count,
        "verify_count": l.verify_count,
        "avg_verify_score": l.avg_verify_score,
        "publisher_name": l.publisher_name,
        "is_featured": l.is_featured,
        "created_at": l.created_at.isoformat() if l.created_at else None,
    }

    if detail:
        d["system_prompt"] = l.system_prompt
        d["eval_snapshot"] = json.loads(l.eval_snapshot or "{}")
        d["test_cases_preview"] = json.loads(l.test_cases_snapshot or "[]")[:5]  # first 5 only
        d["criteria"] = json.loads(l.criteria_snapshot or "[]")
        d["custom_rules"] = json.loads(l.custom_rules_snapshot or "[]")
        d["included_documents"] = json.loads(l.included_documents or "[]")
        d["publisher_tenant_id"] = l.publisher_tenant_id

    return d


# ─── Browse ───

@router.get("")
def browse_marketplace(
    category: str = Query(None),
    search: str = Query(None),
    sort: str = Query("score"),  # "score" | "clones" | "newest"
    db: Session = Depends(get_db),
):
    """Browse marketplace listings. Public — no auth required."""
    q = db.query(MarketplaceListing).filter(MarketplaceListing.status == "active")

    if category and category != "all":
        q = q.filter(MarketplaceListing.category == category)

    if search:
        q = q.filter(
            MarketplaceListing.name.ilike(f"%{search}%") |
            MarketplaceListing.description.ilike(f"%{search}%") |
            MarketplaceListing.tags.ilike(f"%{search}%")
        )

    if sort == "score":
        q = q.order_by(MarketplaceListing.overall_score.desc().nullslast())
    elif sort == "clones":
        q = q.order_by(MarketplaceListing.clone_count.desc())
    else:  # newest
        q = q.order_by(MarketplaceListing.created_at.desc())

    listings = q.limit(50).all()

    return {
        "listings": [_listing_to_dict(l) for l in listings],
        "total": len(listings),
    }


# ─── Detail ───

@router.get("/{listing_id}")
def get_listing(listing_id: str, db: Session = Depends(get_db)):
    """Get full listing detail with performance card. Public."""
    listing = db.query(MarketplaceListing).filter(
        MarketplaceListing.id == listing_id,
        MarketplaceListing.status == "active",
    ).first()

    if not listing:
        return JSONResponse({"error": "Listing not found"}, status_code=404)

    return _listing_to_dict(listing, detail=True)


# ─── Publish ───

@router.post("/publish")
def publish_agent(
    workspace_id: str = Query(...),
    environment_id: str = Query(None),
    category: str = Query("general"),
    tags: str = Query("[]"),
    pack_type: str = Query("byod"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Publish an agent to the marketplace."""

    # Load agent
    ws = db.query(Workspace).filter(
        Workspace.id == workspace_id,
        Workspace.tenant_id == user.tenant_id,
        Workspace.agent_type.isnot(None),
    ).first()

    if not ws:
        return JSONResponse({"error": "Agent not found"}, status_code=404)

    if not ws.system_prompt:
        return JSONResponse({"error": "Agent must have a system prompt before publishing"}, status_code=400)

    # Publisher info
    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    publisher_name = user.name or user.email.split("@")[0]

    # Snapshot documents metadata
    docs = db.query(Document).filter(
        Document.workspace_id == workspace_id,
        Document.status == "ready",
    ).all()
    doc_meta = [
        {"filename": d.filename, "file_type": d.file_type, "chunk_count": d.chunk_count}
        for d in docs
    ]

    # ─── Performance card from best eval run ───
    eval_snapshot = {}
    test_cases_snapshot = "[]"
    criteria_snapshot = "[]"
    custom_rules_snapshot = "[]"
    test_case_count = 0
    overall_score = None
    source_env_id = environment_id

    if environment_id:
        env = db.query(Environment).filter(
            Environment.id == environment_id,
            Environment.tenant_id == user.tenant_id,
        ).first()

        if env:
            # Find best completed run
            best_run = db.query(EvalRun).filter(
                EvalRun.environment_id == environment_id,
                EvalRun.status == "completed",
            ).order_by(EvalRun.overall_score.desc()).first()

            if best_run:
                overall_score = best_run.overall_score

                # Build performance card
                results = db.query(EvalResult).filter(
                    EvalResult.eval_run_id == best_run.id,
                ).all()

                # Criteria breakdown
                criteria_avgs = {}
                for r in results:
                    scores = json.loads(r.criteria_scores or "{}")
                    for k, v in scores.items():
                        s = v.get("score", v) if isinstance(v, dict) else v
                        criteria_avgs.setdefault(k, []).append(s)

                criteria_breakdown = []
                env_criteria = db.query(JudgeCriteria).filter(
                    JudgeCriteria.environment_id == environment_id,
                    JudgeCriteria.is_enabled == True,
                ).all()
                for c in env_criteria:
                    avg = sum(criteria_avgs.get(c.key, [50])) / max(len(criteria_avgs.get(c.key, [50])), 1)
                    criteria_breakdown.append({
                        "key": c.key,
                        "label": c.label,
                        "avg_score": round(avg, 1),
                        "weight": c.weight,
                    })

                # Test case previews
                test_previews = [
                    {"question": r.question, "score": r.overall_score, "status": r.status}
                    for r in results
                ]

                # Response time
                times = [r.response_time_ms for r in results if r.response_time_ms]
                avg_time = round(sum(times) / max(len(times), 1)) if times else 0

                eval_snapshot = {
                    "overall_score": overall_score,
                    "passed": best_run.passed,
                    "warned": best_run.warned,
                    "failed": best_run.failed,
                    "total_cases": len(results),
                    "criteria_breakdown": criteria_breakdown,
                    "response_time_avg_ms": avg_time,
                    "test_cases_preview": test_previews,
                }

            # Snapshot test cases
            tcs = db.query(TestCase).filter(
                TestCase.environment_id == environment_id,
            ).order_by(TestCase.sort_order).all()
            test_cases_snapshot = json.dumps([
                {"question": t.question, "expected_answer": t.expected_answer, "tags": t.tags, "sort_order": t.sort_order}
                for t in tcs
            ])
            test_case_count = len(tcs)

            # Snapshot criteria
            criteria_rows = db.query(JudgeCriteria).filter(
                JudgeCriteria.environment_id == environment_id,
            ).all()
            criteria_snapshot = json.dumps([
                {"key": c.key, "label": c.label, "description": c.description or "", "weight": c.weight, "is_enabled": c.is_enabled}
                for c in criteria_rows
            ])

            # Snapshot custom rules
            rules = db.query(JudgeCustomRule).filter(
                JudgeCustomRule.environment_id == environment_id,
            ).all()
            custom_rules_snapshot = json.dumps([r.rule_text for r in rules])

    # Create listing
    listing = MarketplaceListing(
        publisher_tenant_id=user.tenant_id,
        publisher_user_id=user.id,
        publisher_name=publisher_name,
        source_workspace_id=workspace_id,
        source_environment_id=source_env_id,
        name=ws.name,
        description=ws.agent_description or "",
        icon=ws.agent_icon or "",
        system_prompt=ws.system_prompt,
        agent_type=ws.agent_type or "custom",
        category=category,
        tags=tags,
        pack_type=pack_type,
        included_documents=json.dumps(doc_meta),
        document_count=len(docs),
        overall_score=overall_score,
        eval_snapshot=json.dumps(eval_snapshot),
        test_cases_snapshot=test_cases_snapshot,
        criteria_snapshot=criteria_snapshot,
        custom_rules_snapshot=custom_rules_snapshot,
        test_case_count=test_case_count,
    )

    db.add(listing)
    db.commit()
    db.refresh(listing)

    print(f"  [Marketplace] Published: {listing.name} (score={overall_score}, {test_case_count} tests, {len(docs)} docs)")

    return _listing_to_dict(listing, detail=True)


# ─── Clone ───

@router.post("/{listing_id}/clone")
def clone_listing(
    listing_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Clone a marketplace listing into the user's workspace."""

    listing = db.query(MarketplaceListing).filter(
        MarketplaceListing.id == listing_id,
        MarketplaceListing.status == "active",
    ).first()

    if not listing:
        return JSONResponse({"error": "Listing not found"}, status_code=404)

    # Check if already cloned by this tenant
    existing = db.query(MarketplaceClone).filter(
        MarketplaceClone.listing_id == listing_id,
        MarketplaceClone.cloned_by_tenant_id == user.tenant_id,
    ).first()

    if existing:
        return JSONResponse({"error": "Already cloned this agent"}, status_code=409)

    # ─── Create agent (workspace) ───
    new_ws = Workspace(
        tenant_id=user.tenant_id,
        name=f"{listing.name}",
        description=listing.description,
        agent_type=listing.agent_type,
        system_prompt=listing.system_prompt,
        agent_icon=listing.icon,
        agent_description=listing.description,
        show_on_homepage=False,
    )
    db.add(new_ws)
    db.flush()  # get the ID

    # ─── Create eval environment with test cases + criteria ───
    new_env_id = None
    test_cases = json.loads(listing.test_cases_snapshot or "[]")
    criteria = json.loads(listing.criteria_snapshot or "[]")
    custom_rules = json.loads(listing.custom_rules_snapshot or "[]")

    if test_cases:
        new_env = Environment(
            tenant_id=user.tenant_id,
            workspace_id=new_ws.id,
            name=f"{listing.name} — Eval",
            description=f"Cloned from marketplace: {listing.name}",
            created_by=user.id,
        )
        db.add(new_env)
        db.flush()
        new_env_id = new_env.id

        # Clone test cases
        for i, tc in enumerate(test_cases):
            db.add(TestCase(
                environment_id=new_env.id,
                question=tc.get("question", ""),
                expected_answer=tc.get("expected_answer", ""),
                tags=tc.get("tags"),
                sort_order=tc.get("sort_order", i),
            ))

        # Clone criteria
        for c in criteria:
            db.add(JudgeCriteria(
                environment_id=new_env.id,
                key=c.get("key", ""),
                label=c.get("label", ""),
                description=c.get("description", ""),
                weight=c.get("weight", 25),
                is_enabled=c.get("is_enabled", True),
            ))

        # Clone custom rules
        for i, rule in enumerate(custom_rules):
            db.add(JudgeCustomRule(
                environment_id=new_env.id,
                rule_text=rule,
                sort_order=i,
            ))

    # ─── Record the clone ───
    clone = MarketplaceClone(
        listing_id=listing_id,
        cloned_by_tenant_id=user.tenant_id,
        cloned_by_user_id=user.id,
        cloned_workspace_id=new_ws.id,
        cloned_environment_id=new_env_id,
    )
    db.add(clone)

    # Update listing stats
    listing.clone_count = (listing.clone_count or 0) + 1

    db.commit()

    print(f"  [Marketplace] Cloned: {listing.name} → tenant={user.tenant_id}, agent={new_ws.id}, env={new_env_id}")

    return {
        "status": "cloned",
        "agent_id": new_ws.id,
        "environment_id": new_env_id,
        "listing_name": listing.name,
    }


# ─── Delist ───

@router.delete("/{listing_id}")
def delist_agent(
    listing_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delist an agent from marketplace (publisher only)."""

    listing = db.query(MarketplaceListing).filter(
        MarketplaceListing.id == listing_id,
        MarketplaceListing.publisher_tenant_id == user.tenant_id,
    ).first()

    if not listing:
        return JSONResponse({"error": "Listing not found or not yours"}, status_code=404)

    listing.status = "delisted"
    db.commit()

    return {"status": "delisted"}
