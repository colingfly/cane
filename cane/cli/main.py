"""
cane.cli.main -- CLI for the Cane platform.

Usage:
    cane serve              Start the API server
    cane init               Initialize a new Cane project
    cane agent create       Create an agent
    cane agent list         List agents
    cane eval <agent>       Run personality eval
    cane dev                Start in dev mode with reload
"""
import argparse
import os
import sys


def cmd_serve(args):
    """Start the Cane API server."""
    from cane import Cane
    app = Cane()
    app.serve(
        host=args.host,
        port=args.port,
        reload=args.reload,
    )


def cmd_dev(args):
    """Start in dev mode with auto-reload."""
    from cane import Cane
    app = Cane()
    app.serve(host="0.0.0.0", port=args.port, reload=True)


def cmd_init(args):
    """Initialize a new Cane project."""
    print("Initializing Cane project...")

    # Create .env template
    if not os.path.exists(".env"):
        with open(".env", "w") as f:
            f.write("ANTHROPIC_API_KEY=\n")
            f.write("OPENROUTER_API_KEY=\n")
            f.write("CANE_SECRET_KEY=change-me-to-a-random-string\n")
            f.write("CANE_DB_NAME=cane\n")
            f.write("CANE_DB_USER=root\n")
            f.write("CANE_DB_PASSWORD=\n")
        print("  Created .env")

    # Create data directory
    os.makedirs("data", exist_ok=True)
    print("  Created data/")

    print("\nDone. Edit .env with your API keys, then run: cane serve")


def cmd_agent_create(args):
    """Create an agent."""
    from cane import Cane
    app = Cane()
    agent = app.agents.create(
        name=args.name,
        personality=args.personality or "",
    )
    print(f"Created agent: {agent.name} ({agent.id})")


def cmd_agent_list(args):
    """List agents."""
    from cane import Cane
    app = Cane()
    agents = app.agents.list()
    if not agents:
        print("No agents found.")
        return
    for a in agents:
        print(f"  {a['name']} ({a['id'][:8]}...) type={a['type'] or 'custom'}")


def cmd_eval(args):
    """Run personality eval on an agent."""
    from cane import Cane
    app = Cane()
    agent = app.agents.get(args.agent)
    result = agent.eval.run(suite=args.suite)
    if "error" in result:
        print(f"Error: {result['error']}")
        return
    print(f"Agent: {result.get('agent_name', args.agent)}")
    print(f"Suite: {result.get('suite', args.suite)}")
    print(f"Score: {result.get('composite_score', '?')} ({result.get('grade', '?')})")
    dims = result.get("dimension_scores", {})
    for dim, score in dims.items():
        print(f"  {dim}: {score}")


def main():
    parser = argparse.ArgumentParser(
        prog="cane",
        description="Cane -- Open-source agentic infrastructure",
    )
    subparsers = parser.add_subparsers(dest="command")

    # serve
    serve_parser = subparsers.add_parser("serve", help="Start the API server")
    serve_parser.add_argument("--host", default="0.0.0.0")
    serve_parser.add_argument("--port", type=int, default=8000)
    serve_parser.add_argument("--reload", action="store_true")

    # dev
    dev_parser = subparsers.add_parser("dev", help="Start in dev mode")
    dev_parser.add_argument("--port", type=int, default=8000)

    # init
    subparsers.add_parser("init", help="Initialize a new Cane project")

    # agent create
    agent_create = subparsers.add_parser("agent-create", help="Create an agent")
    agent_create.add_argument("--name", required=True)
    agent_create.add_argument("--personality", default="")

    # agent list
    subparsers.add_parser("agent-list", help="List agents")

    # eval
    eval_parser = subparsers.add_parser("eval", help="Run personality eval")
    eval_parser.add_argument("agent", help="Agent name or ID")
    eval_parser.add_argument("--suite", default="basic_personality")

    args = parser.parse_args()

    if args.command == "serve":
        cmd_serve(args)
    elif args.command == "dev":
        cmd_dev(args)
    elif args.command == "init":
        cmd_init(args)
    elif args.command == "agent-create":
        cmd_agent_create(args)
    elif args.command == "agent-list":
        cmd_agent_list(args)
    elif args.command == "eval":
        cmd_eval(args)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
