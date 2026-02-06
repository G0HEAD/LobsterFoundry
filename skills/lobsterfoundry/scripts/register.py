import argparse
import json

from lib import DEFAULT_BASE_URL, request_json


def main():
    parser = argparse.ArgumentParser(description='Register a bot with LobsterFoundry')
    parser.add_argument('--public-key', required=True, help='Public key string')
    parser.add_argument('--name', default=None, help='Display name')
    parser.add_argument('--agent-type', default='openclaw', help='Agent type')
    parser.add_argument('--agent-version', default='1.0.0', help='Agent version')
    parser.add_argument('--base-url', default=DEFAULT_BASE_URL, help='Base URL')
    args = parser.parse_args()

    payload = {
        'agent_type': args.agent_type,
        'agent_version': args.agent_version,
        'public_key': args.public_key,
        'requested_name': args.name
    }

    status, data = request_json(
        f"{args.base_url}/api/world/bot/register",
        method='POST',
        body=payload
    )

    print(json.dumps({'status': status, 'response': data}, indent=2))


if __name__ == '__main__':
    main()
