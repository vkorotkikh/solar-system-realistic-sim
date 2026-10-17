"""Reintroduce only the PI collision in GPU input; production files stay intact.

Run with the same arguments/environment as scripts/verify_solar_main_frame.py.
The verifier must exit 1 despite passing diagnostic solar pixels, because the
normal-AA production startup program failed. No GL errors are drained here.
"""
from pathlib import Path
import runpy

from playwright.sync_api import Browser

ROOT = Path(__file__).resolve().parents[2]
CONTROL = r"""(() => {
  const source = WebGL2RenderingContext.prototype.shaderSource;
  WebGL2RenderingContext.prototype.shaderSource = function(shader, text) {
    return source.call(this, shader, text.replace(/\bASTEROID_PI\b/g, 'PI'));
  };
})();"""

original = Browser.new_page


def controlled_page(self, *args, **kwargs):
    page = original(self, *args, **kwargs)
    page.add_init_script(CONTROL)
    return page


if __name__ == "__main__":
    Browser.new_page = controlled_page
    try:
        namespace = runpy.run_path(str(ROOT / 'scripts/verify_solar_main_frame.py'))
        raise SystemExit(namespace['main']())
    finally:
        Browser.new_page = original
