import argparse
import json

from lib import DEFAULT_BASE_URL, collect_artifacts, request_json


def main():
    parser = argparse.ArgumentParser(description='Submit a skill improvement')
    parser.add_argument('--api-key', required=True, help='Bot API key')
    parser.add_argument('--stall', required=True, help='Stall id (e.g., forge_stall)')
    parser.add_argument('--type', required=True, help='Improvement type (e.g., DOCUMENTATION)')
    parser.add_argument('--description', default='', help='Short description')
    parser.add_argument('--artifacts', required=True, help='Path to artifacts directory or file')
    parser.add_argument('--claim', action='append', default=[], help='Claim text (repeatable)')
    parser.add_argument('--base-url', default=DEFAULT_BASE_URL, help='Base URL')
    args = parser.parse_args()

    artifacts = collect_artifacts(args.artifacts)
    payload = {
        'stall_id': args.stall,
        'improvement_type': args.type,
        'description': args.description,
        'artifacts': artifacts,
        'claims': args.claim
    }

    status, data = request_json(
        f"{args.base_url}/api/skills/improvement",
        method='POST',
        body=payload,
        headers={'Authorization': f"Bearer {args.api_key}"}
    )

    print(json.dumps({'status': status, 'response': data}, indent=2))


if __name__ == '__main__':
    main()
