"""Loopback-only server; never writes imported models to disk."""
import argparse
import json
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from engine import solve, validate, ModelError
from project_v2 import migrate
from design_beam25 import design as design_beam
from design_rc25 import design_all as rc_design_all

ROOT = Path(__file__).resolve().parent


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'static'), **kwargs)

    def allowed(self):
        port = self.server.server_port
        allowed_hosts = {f'127.0.0.1:{port}', f'localhost:{port}'}
        host = self.headers.get('Host')
        return host in allowed_hosts

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def reply(self, status, data):
        body = json.dumps(data, ensure_ascii=False, allow_nan=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self.allowed():
            return self.reply(403, {'error': 'Local origin required'})
        if self.path == '/api/health':
            return self.reply(200, {'app': 'RCStudio', 'version': '0.2'})
        super().do_GET()

    def do_POST(self):
        if not self.allowed() or self.headers.get('Content-Type') != 'application/json':
            return self.reply(403, {'error': 'Local JSON request required'})
        if self.path not in ('/api/analyze', '/api/validate', '/api/save', '/api/export', '/api/design-beam', '/api/design-beam-export', '/api/design-all', '/api/export-pdf'):
            return self.reply(404, {'error': 'Not found'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 1_000_000:
                raise ModelError('Model size limit: 1 MB')
            data = json.loads(self.rfile.read(length))
            if self.path == '/api/design-beam':
                return self.reply(200, design_beam(data))
            if self.path == '/api/design-beam-export':
                payload = design_beam(data)
                folder = ROOT / 'projects'
                folder.mkdir(exist_ok=True)
                name = 'beam-aci25-' + datetime.now().strftime('%Y%m%d-%H%M%S-%f') + '.json'
                target = folder / name
                with target.open('x', encoding='utf-8') as stream:
                    json.dump(payload, stream, ensure_ascii=False, indent=2, allow_nan=False)
                return self.reply(200, {'saved': True, 'path': str(target), 'filename': name})
            if self.path == '/api/validate':
                validate(data, draft=True)
                return self.reply(200, {'valid': True, 'model': migrate(data)})
            if self.path in ('/api/save', '/api/export'):
                validate(data, draft=True)
                export = self.path == '/api/export'
                payload = {'model': data, 'result': solve(data)} if export else data
                folder = ROOT / 'projects'
                folder.mkdir(exist_ok=True)
                name = ('analysis-' if export else 'project-') + datetime.now().strftime('%Y%m%d-%H%M%S-%f') + ('.json' if export else '.rcstudio')
                target = folder / name
                with target.open('x', encoding='utf-8') as stream:
                    json.dump(payload, stream, ensure_ascii=False, indent=2, allow_nan=False)
                return self.reply(200, {'saved': True, 'path': str(target), 'filename': name})
            if self.path == '/api/design-all':
                design_basis = data.get('designBasis', {
                    'fc_mpa': 23.5, 'fy_mpa': 392, 'fyt_mpa': 235,
                    'cover_mm': 40, 'agg_mm': 20, 'stirrup_mm': 9,
                })
                model_data = {k: v for k, v in data.items() if k != 'designBasis'}
                analysis = solve(model_data)
                design_result = rc_design_all(model_data, analysis, design_basis)
                return self.reply(200, {'analysis': analysis, 'design': design_result})
            if self.path == '/api/export-pdf':
                from generate_pdf_report import generate_complete_calculation_report
                design_basis = data.get('designBasis', {
                    'fc_mpa': 23.5, 'fy_mpa': 392, 'fyt_mpa': 235,
                    'cover_mm': 40, 'agg_mm': 20, 'stirrup_mm': 9,
                })
                model_data = {k: v for k, v in data.items() if k != 'designBasis'}
                analysis = solve(model_data)
                design_result = rc_design_all(model_data, analysis, design_basis)
                out_dir = ROOT / 'static' / 'reports'
                pdf_path = generate_complete_calculation_report(model_data, analysis, design_result, out_dir)
                return self.reply(200, {
                    'ok': True,
                    'pdfUrl': f'/reports/{pdf_path.name}',
                    'htmlUrl': f'/reports/{pdf_path.with_suffix(".html").name}',
                    'filename': pdf_path.name,
                    'sizeBytes': pdf_path.stat().st_size,
                    'status': design_result.get('summary', {}).get('overallStatus', 'ALL_PASS')
                })
            return self.reply(200, solve(data))
        except (ModelError, ValueError, TypeError, KeyError) as exc:
            self.reply(400, {'error': str(exc)})
        except Exception as exc:
            import traceback
            traceback.print_exc()
            self.reply(500, {'error': f'Analysis failed: {type(exc).__name__}: {str(exc)}'})


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8766)
    args = parser.parse_args()
    print(f'RC Studio: http://127.0.0.1:{args.port}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
