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
import shutil
import traceback
from pathlib import Path
from datetime import datetime

from fastapi import APIRouter, Depends, Query, BackgroundTasks
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_user
from config import UPLOAD_DIR
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
        "tool_count": l.tool_count or 0,
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
        d["tools"] = json.loads(l.tools_snapshot or "[]")

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
        q = q.order_by(
            MarketplaceListing.overall_score.is_(None),
            MarketplaceListing.overall_score.desc(),
        )
    elif sort == "clones":
        q = q.order_by(MarketplaceListing.clone_count.desc())
    else:  # newest
        q = q.order_by(MarketplaceListing.created_at.desc())

    listings = q.limit(50).all()

    return {
        "listings": [_listing_to_dict(l) for l in listings],
        "total": len(listings),
    }


# ─── Publish ───

@router.post("/publish")
def publish_agent(
    workspace_id: str = Query(...),
    environment_id: str = Query(None),
    run_id: str = Query(None),
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
            # Find the run to use for performance card
            if run_id:
                best_run = db.query(EvalRun).filter(
                    EvalRun.id == run_id,
                    EvalRun.environment_id == environment_id,
                    EvalRun.status == "completed",
                ).first()
            else:
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
    # Snapshot tools (schema only — strip auth values)
    from tool_models import AgentTool
    agent_tools = db.query(AgentTool).filter(
        AgentTool.workspace_id == workspace_id,
        AgentTool.tenant_id == user.tenant_id,
        AgentTool.is_enabled == True,
    ).all()
    tools_snapshot = json.dumps([
        {
            "name": t.name,
            "description": t.description,
            "tool_type": t.tool_type,
            "url": t.url,
            "method": t.method,
            "parameters": json.loads(t.parameters or "[]"),
            "fire_and_forget": t.fire_and_forget,
        }
        for t in agent_tools
    ])

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
        tools_snapshot=tools_snapshot,
        tool_count=len(agent_tools),
    )

    db.add(listing)
    db.commit()
    db.refresh(listing)

    print(f"  [Marketplace] Published: {listing.name} (score={overall_score}, {test_case_count} tests, {len(docs)} docs)")

    return _listing_to_dict(listing, detail=True)


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


# ─── Clone ───

def _ingest_cloned_doc(doc_id, filepath, tenant_id, workspace_id, tenant_name, workspace_name):
    """Background task: ingest a cloned document into the new tenant's ChromaDB namespace."""
    from database import SessionLocal
    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc:
            print(f"  [Clone] Document {doc_id} not found, aborting")
            return

        print(f"  [Clone] Ingesting {doc.filename} for tenant={tenant_id}...")

        from ingestor import Ingestor
        ing = Ingestor()

        result = ing.ingest(
            filepath=filepath,
            tenant_id=tenant_id,
            workspace_id=workspace_id,
            document_id=doc_id,
            company_name=tenant_name,
            workspace_name=workspace_name,
            force=True,
        )

        if result.ok:
            doc.status = "ready"
            doc.chunk_count = len(result.chunks)
            doc.image_count = len(result.images)
            doc.processed_at = datetime.utcnow()
            print(f"  [Clone] Done: {doc.filename} -> {doc.chunk_count} chunks, {doc.image_count} images")
        else:
            doc.status = "error"
            doc.error_message = result.error
            print(f"  [Clone] Error: {doc.filename} -> {result.error}")

        db.commit()
    except Exception as e:
        print(f"  [Clone] Ingestion failed for {doc_id}: {e}")
        traceback.print_exc()
        try:
            doc = db.query(Document).filter(Document.id == doc_id).first()
            if doc:
                doc.status = "error"
                doc.error_message = str(e)[:500]
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


@router.post("/{listing_id}/clone")
def clone_listing(
    listing_id: str,
    background_tasks: BackgroundTasks,
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

    try:
        # ─── Create agent (workspace) ───
        new_ws = Workspace(
            tenant_id=user.tenant_id,
            name=f"{listing.name}",
            description=listing.description,
            agent_type=listing.agent_type or "custom",
            system_prompt=listing.system_prompt,
            agent_icon=listing.icon,
            agent_description=listing.description,
            show_on_homepage=False,
        )
        db.add(new_ws)
        db.flush()  # get the ID

        # ─── Transfer documents for open/licensed packs ───
        docs_transferred = 0
        if listing.pack_type in ("open", "licensed"):
            source_dir = UPLOAD_DIR / listing.publisher_tenant_id
            dest_dir = UPLOAD_DIR / user.tenant_id
            dest_dir.mkdir(parents=True, exist_ok=True)

            # Get tenant/workspace names for ingestion metadata
            cloner_tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
            cloner_tenant_name = cloner_tenant.name if cloner_tenant else ""

            doc_meta = json.loads(listing.included_documents or "[]")
            for dm in doc_meta:
                filename = dm.get("filename", "")
                if not filename:
                    continue

                source_file = source_dir / filename
                if not source_file.exists():
                    print(f"  [Clone] Source file not found: {source_file}")
                    continue

                # Copy file to cloner's upload directory
                dest_file = dest_dir / filename
                shutil.copy2(str(source_file), str(dest_file))

                # Create document record
                new_doc = Document(
                    tenant_id=user.tenant_id,
                    workspace_id=new_ws.id,
                    uploaded_by=user.id,
                    filename=filename,
                    file_type=dm.get("file_type", ""),
                    file_size_bytes=source_file.stat().st_size,
                    status="processing",
                )
                db.add(new_doc)
                db.flush()

                # Queue background ingestion
                background_tasks.add_task(
                    _ingest_cloned_doc,
                    doc_id=new_doc.id,
                    filepath=str(dest_file),
                    tenant_id=user.tenant_id,
                    workspace_id=new_ws.id,
                    tenant_name=cloner_tenant_name,
                    workspace_name=new_ws.name,
                )
                docs_transferred += 1
                print(f"  [Clone] Queued ingestion: {filename}")

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
                rule_text = rule if isinstance(rule, str) else rule.get("rule_text", str(rule))
                db.add(JudgeCustomRule(
                    environment_id=new_env.id,
                    rule_text=rule_text,
                    sort_order=i,
                ))

        # ─── Clone tool schemas (disabled, no auth) ───
        tools_cloned = 0
        tools_data = json.loads(listing.tools_snapshot or "[]")
        if tools_data:
            from tool_models import AgentTool
            for t in tools_data:
                tool_url = t.get("url", "")
                # Platform tools (cane.fyi) are safe to pre-fill
                is_platform = tool_url.startswith("https://cane.fyi/api/")
                new_tool = AgentTool(
                    workspace_id=new_ws.id,
                    tenant_id=user.tenant_id,
                    name=t.get("name", ""),
                    description=t.get("description", ""),
                    tool_type=t.get("tool_type", "webhook"),
                    url=tool_url if is_platform else "",  # Pre-fill platform tools
                    method=t.get("method", "POST"),
                    headers="{}",
                    payload_template="{}",
                    auth_type="none",
                    auth_value="",
                    parameters=json.dumps(t.get("parameters", [])),
                    fire_and_forget=t.get("fire_and_forget", True),
                    is_enabled=is_platform,  # Auto-enable platform tools
                )
                db.add(new_tool)
                tools_cloned += 1

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

        print(f"  [Marketplace] Cloned: {listing.name} → tenant={user.tenant_id}, agent={new_ws.id}, env={new_env_id}, docs={docs_transferred}, tools={tools_cloned}")

        return {
            "status": "cloned",
            "agent_id": new_ws.id,
            "environment_id": new_env_id,
            "listing_name": listing.name,
            "documents_transferred": docs_transferred,
            "tools_cloned": tools_cloned,
        }

    except Exception as e:
        db.rollback()
        print(f"  [Marketplace] Clone FAILED for {listing_id}: {e}")
        traceback.print_exc()
        return JSONResponse(
            {"error": f"Clone failed: {str(e)[:200]}"},
            status_code=500,
        )


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