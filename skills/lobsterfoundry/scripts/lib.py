import json
import os
import urllib.request
import urllib.error


DEFAULT_BASE_URL = os.environ.get('LOBSTER_BASE_URL') or os.environ.get('LOBSTER_SERVER', 'http://localhost:5173')


def request_json(url, method='GET', body=None, headers=None):
    data = None
    if body is not None:
        data = json.dumps(body).encode('utf-8')

    req = urllib.request.Request(url, data=data, method=method)
    if body is not None:
        req.add_header('Content-Type', 'application/json')

    if headers:
        for key, value in headers.items():
            req.add_header(key, value)

    try:
        with urllib.request.urlopen(req) as resp:
            payload = resp.read().decode('utf-8')
            return resp.status, json.loads(payload) if payload else None
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode('utf-8')
        try:
            data = json.loads(payload)
        except Exception:
            data = {'error': payload}
        return exc.code, data


def infer_artifact_type(filename):
    lower = filename.lower()
    if lower.endswith('.md'):
        return 'documentation'
    if lower.endswith(('.js', '.ts', '.py', '.rs', '.go')):
        return 'code'
    if lower.endswith(('.patch', '.diff')):
        return 'code'
    if lower.endswith('.json'):
        return 'data'
    return 'text'


def collect_artifacts(path):
    if not path:
        return []

    files = []
    if os.path.isfile(path):
        files = [path]
    elif os.path.isdir(path):
        files = [
            os.path.join(path, name)
            for name in os.listdir(path)
            if os.path.isfile(os.path.join(path, name))
        ]

    artifacts = []
    for file_path in files:
        with open(file_path, 'r', encoding='utf-8') as handle:
            content = handle.read()
        artifacts.append({
            'name': os.path.basename(file_path),
            'content': content,
            'type': infer_artifact_type(file_path)
        })

    return artifacts
