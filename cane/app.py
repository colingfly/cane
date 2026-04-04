"""
cane/app.py -- Main entry point for the Cane platform.

Usage:
    from cane import Cane

    # Minimal (SQLite + embedded ChromaDB)
    app = Cane()

    # Full config
    app = Cane(
        database_url="mysql+pymysql://user:pass@localhost/cane",
        chroma_path="/data/chroma",
        secret_key="your-jwt-secret",
        anthropic_api_key="sk-ant-...",
        openrouter_api_key="sk-or-...",
        enable_game=True,
    )

    # Create an agent
    agent = app.agents.create(name="Dusty", personality="A retired gunslinger")
    agent.ingest("docs/")
    response = agent.ask("What's in these documents?")

    # Run as server
    app.serve(port=8000)
"""
import os


class AgentManager:
    """Interface for creating and managing agents."""

    def __init__(self, cane_app):
        self._app = cane_app

    def create(self, name: str, personality: str = "", model: str = None, **kwargs):
        """Create a new agent (workspace)."""
        from cane.core.database import SessionLocal
        from cane.core.models import Workspace

        db = SessionLocal()
        try:
            ws = Workspace(
                tenant_id=kwargs.get("tenant_id", self._app._default_tenant_id),
                name=name,
                system_prompt=personality,
                agent_type=kwargs.get("agent_type", "custom"),
                agent_description=kwargs.get("description", ""),
                agent_icon=kwargs.get("icon", ""),
            )
            if model:
                from cane.inference.providers import detect_provider_from_model
                ws.inference_provider = detect_provider_from_model(model)
                ws.inference_model = model
            db.add(ws)
            db.commit()
            db.refresh(ws)
            return AgentHandle(ws.id, ws.name, self._app)
        finally:
            db.close()

    def get(self, name_or_id: str):
        """Get an existing agent by name or ID."""
        from cane.core.database import SessionLocal
        from cane.core.models import Workspace

        db = SessionLocal()
        try:
            ws = db.query(Workspace).filter(
                (Workspace.id == name_or_id) | (Workspace.name == name_or_id)
            ).first()
            if not ws:
                raise ValueError(f"Agent not found: {name_or_id}")
            return AgentHandle(ws.id, ws.name, self._app)
        finally:
            db.close()

    def list(self, tenant_id: str = None):
        """List all agents."""
        from cane.core.database import SessionLocal
        from cane.core.models import Workspace

        db = SessionLocal()
        try:
            q = db.query(Workspace)
            if tenant_id:
                q = q.filter(Workspace.tenant_id == tenant_id)
            return [{"id": ws.id, "name": ws.name, "type": ws.agent_type} for ws in q.all()]
        finally:
            db.close()


class AgentHandle:
    """Handle to an individual agent for convenience methods."""

    def __init__(self, workspace_id: str, name: str, cane_app):
        self.id = workspace_id
        self.name = name
        self._app = cane_app

    def ask(self, question: str, **kwargs):
        """Ask the agent a question using the RAG pipeline."""
        from cane.core.database import SessionLocal
        from cane.core.models import Workspace
        from cane.rag.context import build_context, build_system_prompt, call_claude

        db = SessionLocal()
        try:
            ws = db.query(Workspace).filter(Workspace.id == self.id).first()
            ctx = build_context(question, ws.tenant_id, self.id)
            system = build_system_prompt(ws.system_prompt or "")
            if ctx.has_content:
                prompt = f"Question: {question}\n\nDocument Excerpts:\n{ctx.context}\n\nProvide a clear answer."
            else:
                prompt = question
            answer = call_claude(prompt, system=system, workspace=ws)
            return _AnswerResult(answer=answer, sources=ctx.sources, chunks_used=ctx.chunks_used)
        finally:
            db.close()

    def ingest(self, path: str, **kwargs):
        """Ingest a file or directory into the agent's knowledge base."""
        from cane.core.database import SessionLocal
        from cane.core.models import Workspace
        from cane.rag.ingestor import ingest_file

        db = SessionLocal()
        try:
            ws = db.query(Workspace).filter(Workspace.id == self.id).first()
            if os.path.isdir(path):
                results = []
                for fname in os.listdir(path):
                    fpath = os.path.join(path, fname)
                    if os.path.isfile(fpath):
                        r = ingest_file(fpath, ws.tenant_id, self.id, db)
                        results.append(r)
                return results
            else:
                return ingest_file(path, ws.tenant_id, self.id, db)
        finally:
            db.close()

    def conversation(self):
        """Start a new conversation session."""
        return ConversationSession(self)

    @property
    def memory(self):
        return MemoryHandle(self)

    @property
    def eval(self):
        return EvalHandle(self)

    @property
    def finetune(self):
        return FinetuneHandle(self)

    def deploy(self, model_id: str, provider: str = "openai"):
        """Deploy a fine-tuned model to this agent."""
        from cane.core.database import SessionLocal
        from cane.core.models import Workspace

        db = SessionLocal()
        try:
            ws = db.query(Workspace).filter(Workspace.id == self.id).first()
            ws.inference_provider = provider
            ws.inference_model = model_id
            db.commit()
        finally:
            db.close()


class ConversationSession:
    def __init__(self, agent: AgentHandle):
        self._agent = agent
        self._history = []

    def send(self, message: str):
        self._history.append({"role": "user", "content": message})
        response = self._agent.ask(message)
        self._history.append({"role": "assistant", "content": response.answer})
        return response


class MemoryHandle:
    def __init__(self, agent: AgentHandle):
        self._agent = agent

    def get_cloud(self):
        from cane.core.database import SessionLocal
        from cane.game.memory import get_topic_cloud
        db = SessionLocal()
        try:
            return get_topic_cloud(self._agent.id, db)
        finally:
            db.close()


class EvalHandle:
    def __init__(self, agent: AgentHandle):
        self._agent = agent

    def run(self, suite: str = "basic_personality", **kwargs):
        from cane.core.database import SessionLocal
        from cane.core.models import Workspace
        from cane.eval.personality import run_personality_eval
        db = SessionLocal()
        try:
            ws = db.query(Workspace).filter(Workspace.id == self._agent.id).first()
            return run_personality_eval(
                workspace_id=self._agent.id,
                tenant_id=ws.tenant_id,
                suite_name=suite,
                db=db,
                **kwargs,
            )
        finally:
            db.close()

    def mine_failures(self, **kwargs):
        from cane.core.database import SessionLocal
        from cane.eval.models import MiningJob
        db = SessionLocal()
        try:
            jobs = db.query(MiningJob).filter(
                MiningJob.status == "completed",
            ).all()
            return jobs
        finally:
            db.close()


class FinetuneHandle:
    def __init__(self, agent: AgentHandle):
        self._agent = agent

    def generate_dataset(self, **kwargs):
        """Generate training dataset from eval results + mined corrections."""
        # Delegates to the existing finetune pipeline
        return {"status": "use /api/finetune/generate-dataset endpoint"}

    def submit(self, **kwargs):
        """Submit a fine-tuning job."""
        return {"status": "use /api/finetune/submit endpoint"}


class _AnswerResult:
    def __init__(self, answer: str, sources: list, chunks_used: int):
        self.answer = answer
        self.sources = sources
        self.chunks_used = chunks_used

    def __repr__(self):
        return f"AnswerResult(answer='{self.answer[:80]}...', sources={len(self.sources)}, chunks={self.chunks_used})"


class Cane:
    """
    Main entry point for the Cane platform.

    Initializes the database, vector store, and provides access to
    agents, eval, and the full FastAPI server.
    """

    def __init__(
        self,
        database_url: str = None,
        chroma_path: str = None,
        secret_key: str = None,
        anthropic_api_key: str = None,
        openrouter_api_key: str = None,
        cors_origins: list = None,
        enable_game: bool = False,
        enable_marketplace: bool = True,
        **kwargs,
    ):
        # Set env vars before importing config
        if database_url:
            os.environ["DATABASE_URL"] = database_url
        if chroma_path:
            os.environ["CANE_BASE_DIR"] = chroma_path
        if secret_key:
            os.environ["CANE_SECRET_KEY"] = secret_key
        if anthropic_api_key:
            os.environ["ANTHROPIC_API_KEY"] = anthropic_api_key
        if openrouter_api_key:
            os.environ["OPENROUTER_API_KEY"] = openrouter_api_key

        self._enable_game = enable_game
        self._enable_marketplace = enable_marketplace
        self._cors_origins = cors_origins or ["*"]
        self._default_tenant_id = kwargs.get("default_tenant_id", "")

        # Initialize database
        from cane.core.database import init_db
        init_db()

        # Agents interface
        self.agents = AgentManager(self)

    def create_app(self):
        """Create the FastAPI application."""
        from cane.api.app import create_fastapi_app
        return create_fastapi_app(
            cors_origins=self._cors_origins,
            enable_game=self._enable_game,
        )

    def serve(self, host: str = "0.0.0.0", port: int = 8000, reload: bool = False):
        """Start the API server."""
        import uvicorn
        app = self.create_app()
        uvicorn.run(app, host=host, port=port, reload=reload)

    def include_router(self, router):
        """Add a custom router to the FastAPI app."""
        app = self.create_app()
        app.include_router(router)
        return app
