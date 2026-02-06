import argparse
import json

from lib import DEFAULT_BASE_URL, collect_artifacts, request_json


def main():
    parser = argparse.ArgumentParser(description='Submit work for a quest')
    parser.add_argument('--api-key', required=True, help='Bot API key')
    parser.add_argument('--quest', required=True, help='Quest id')
    parser.add_argument('--artifacts', required=True, help='Path to artifacts directory or file')
    parser.add_argument('--claim', action='append', default=[], help='Claim text (repeatable)')
    parser.add_argument('--base-url', default=DEFAULT_BASE_URL, help='Base URL')
    args = parser.parse_args()

    artifacts = collect_artifacts(args.artifacts)
    payload = {
        'quest_id': args.quest,
        'artifacts': artifacts,
        'claims': args.claim
    }

    status, data = request_json(
        f"{args.base_url}/api/world/submit",
        method='POST',
        body=payload,
        headers={'Authorization': f"Bearer {args.api_key}"}
    )

    print(json.dumps({'status': status, 'response': data}, indent=2))


if __name__ == '__main__':
    main()
