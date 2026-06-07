"""gather_project_context: bounded, read-only project summary for the CLAUDE.md
authoring chat. Deterministic, 0 tokens. All test data is synthetic."""
from __future__ import annotations

from project_context import gather_project_context, gather_deploy_context


def _make_project(root, name="myproj"):
    proj = root / name
    (proj / "src").mkdir(parents=True)
    (proj / "README.md").write_text("# MyProj\nA tiny demo service.\n", encoding="utf-8")
    (proj / "package.json").write_text(
        '{"name":"myproj","scripts":{"test":"jest","build":"tsc"}}\n', encoding="utf-8"
    )
    (proj / "src" / "index.js").write_text("console.log('hi');\n", encoding="utf-8")
    # noise that must NOT leak into the summary
    (proj / "node_modules").mkdir()
    (proj / "node_modules" / "junk.js").write_text("x", encoding="utf-8")
    (proj / "venv").mkdir()
    (proj / ".env").write_text("SECRET=should-not-appear\n", encoding="utf-8")
    # .claude/ is config worth *seeing exists*, but is NOT deep-parsed
    (proj / ".claude").mkdir()
    (proj / ".claude" / "settings.json").write_text("{}\n", encoding="utf-8")
    return proj


def test_includes_tree_and_key_file_snippets(tmp_path):
    root = tmp_path / "srv"; root.mkdir()
    proj = _make_project(root)
    out = gather_project_context(str(proj), str(root))

    # directory structure surfaced
    assert "src/" in out
    assert "index.js" in out
    # key files snippeted with their content
    assert "README.md" in out and "A tiny demo service." in out
    assert "package.json" in out and "jest" in out


def test_claude_dir_visible_but_not_deep_parsed(tmp_path):
    root = tmp_path / "srv"; root.mkdir()
    proj = _make_project(root)
    out = gather_project_context(str(proj), str(root))
    # the .claude/ directory is shown in the tree...
    assert ".claude/" in out
    # ...but its internals (settings.json contents / hook parsing) are NOT pulled in
    assert "settings.json" not in out or out.count("settings.json") == 0


def test_excludes_noise_and_secrets(tmp_path):
    root = tmp_path / "srv"; root.mkdir()
    proj = _make_project(root)
    out = gather_project_context(str(proj), str(root))
    assert "node_modules" not in out
    assert "junk.js" not in out
    assert "venv" not in out
    # hidden dotfiles like .env must never be surfaced (secret leak guard)
    assert ".env" not in out
    assert "should-not-appear" not in out


def test_excludes_backup_and_artifact_files(tmp_path):
    """Backup/temp/sidecar files are noise and must not crowd out real structure."""
    root = tmp_path / "srv"; root.mkdir()
    proj = root / "noisy"; proj.mkdir()
    (proj / "index.html").write_text("<html>", encoding="utf-8")
    (proj / "app.db").write_text("x", encoding="utf-8")  # main db = signal, kept
    for noise in ["index.html.bak.20260101", "index.html.bak2.20260102_010101",
                  "app.db-wal", "app.db-shm", "notes~", "mod.pyc", "build.log"]:
        (proj / noise).write_text("x", encoding="utf-8")
    out = gather_project_context(str(proj), str(root))
    assert "index.html" in out
    assert "app.db" in out
    for noise in [".bak.20260101", ".bak2", "db-wal", "db-shm", "notes~", "mod.pyc", "build.log"]:
        assert noise not in out


def test_rejects_path_outside_projects_root(tmp_path):
    root = tmp_path / "srv"; root.mkdir()
    outside = tmp_path / "elsewhere"; outside.mkdir()
    (outside / "README.md").write_text("# secret\n", encoding="utf-8")
    assert gather_project_context(str(outside), str(root)) == ""


def test_missing_or_empty_path_returns_empty(tmp_path):
    root = tmp_path / "srv"; root.mkdir()
    assert gather_project_context("", str(root)) == ""
    assert gather_project_context(str(root / "does-not-exist"), str(root)) == ""


def test_large_key_file_is_truncated(tmp_path):
    root = tmp_path / "srv"; root.mkdir()
    proj = root / "big"; proj.mkdir()
    (proj / "README.md").write_text("A" * 50000 + "\nTAILSENTINEL\n", encoding="utf-8")
    out = gather_project_context(str(proj), str(root))
    # the tail must be cut off, and the whole summary stays bounded
    assert "TAILSENTINEL" not in out
    assert len(out) < 12000


def test_path_equal_to_root_is_allowed(tmp_path):
    root = tmp_path / "srv"; root.mkdir()
    (root / "README.md").write_text("# root project\n", encoding="utf-8")
    out = gather_project_context(str(root), str(root))
    assert "root project" in out


def test_symlinked_key_file_content_not_leaked(tmp_path):
    """A key file symlinked to an outside secret must NOT have its content read."""
    root = tmp_path / "srv"; root.mkdir()
    secret = tmp_path / "id_rsa"
    secret.write_text("-----BEGIN PRIVATE KEY-----\nTOPSECRET\n", encoding="utf-8")
    proj = root / "myrepo"; proj.mkdir()
    (proj / "README.md").symlink_to(secret)  # attacker-planted symlink
    (proj / "notes.md").write_text("# real\n", encoding="utf-8")
    out = gather_project_context(str(proj), str(root))
    assert "TOPSECRET" not in out
    assert "[README.md]" not in out
    # legitimate, non-symlinked structure is still surfaced
    assert "notes.md" in out


def test_truncation_marker_emitted_only_once(tmp_path):
    """Hitting the entry cap inside a subdir must not stack duplicate markers."""
    root = tmp_path / "srv"; root.mkdir()
    proj = root / "proj"; proj.mkdir()
    (proj / "aaa_first").mkdir()
    (proj / "zzz_second").mkdir()
    for i in range(110):  # exceeds _MAX_TREE_ENTRIES (100) inside one subdir
        (proj / "aaa_first" / f"f{i:03}.txt").write_text("x", encoding="utf-8")
    (proj / "zzz_second" / "g.txt").write_text("x", encoding="utf-8")
    out = gather_project_context(str(proj), str(root))
    assert out.count("(省略)") == 1


def test_large_key_file_read_is_memory_bounded(tmp_path):
    """A multi-MB key file must not be fully read into memory before truncating."""
    import tracemalloc
    root = tmp_path / "srv"; root.mkdir()
    proj = root / "big"; proj.mkdir()
    (proj / "README.md").write_text("A" * (20 * 1024 * 1024), encoding="utf-8")  # 20 MB
    tracemalloc.start()
    out = gather_project_context(str(proj), str(root))
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    # output stays bounded and marks truncation...
    assert "…(以下省略)" in out
    # ...and we never allocated anything close to the 20 MB file size.
    assert peak < 5 * 1024 * 1024


def test_symlinked_directory_listing_not_leaked(tmp_path):
    """A symlinked dir (docs -> /outside) must NOT have its children enumerated."""
    root = tmp_path / "srv"; root.mkdir()
    target = tmp_path / "secrets"; target.mkdir()
    (target / "credentials").write_text("AKIA...\n", encoding="utf-8")
    proj = root / "myrepo"; proj.mkdir()
    (proj / "docs").symlink_to(target, target_is_directory=True)
    out = gather_project_context(str(proj), str(root))
    assert "docs/" not in out
    assert "credentials" not in out


def test_deep_gather_includes_top_level_source(tmp_path):
    """deep=True snippets top-level source files (app.py) that shallow skips."""
    root = tmp_path / "srv"; root.mkdir()
    proj = root / "shop"; proj.mkdir()
    (proj / "README.md").write_text("# Shop\n", encoding="utf-8")
    (proj / "app.py").write_text("FLASK_APP_MARKER = 1\n", encoding="utf-8")
    shallow = gather_project_context(str(proj), str(root), deep=False)
    deep = gather_project_context(str(proj), str(root), deep=True)
    assert "FLASK_APP_MARKER" not in shallow   # app.py is not a key file → skipped when shallow
    assert "FLASK_APP_MARKER" in deep and "[app.py]" in deep


def test_deep_gather_still_confined_and_symlink_safe(tmp_path):
    """deep mode keeps the projects_root + symlink guards."""
    root = tmp_path / "srv"; root.mkdir()
    outside = tmp_path / "outside"; outside.mkdir()
    (outside / "secret.py").write_text("LEAK=1\n", encoding="utf-8")
    proj = root / "shop"; proj.mkdir()
    (proj / "evil.py").symlink_to(outside / "secret.py")
    assert gather_project_context(str(outside), str(root), deep=True) == ""   # outside root
    assert "LEAK" not in gather_project_context(str(proj), str(root), deep=True)  # symlinked source skipped


def test_gather_deploy_context_finds_related_systemd_and_nginx(tmp_path):
    """System probe surfaces only units/sites that reference THIS project."""
    root = tmp_path / "srv"; root.mkdir()
    proj = root / "shop"; proj.mkdir()
    sysd = tmp_path / "systemd"; sysd.mkdir()
    ngx = tmp_path / "nginx"; ngx.mkdir()
    (sysd / "shop.service").write_text(
        f"[Unit]\nDescription=Shop\n[Service]\nWorkingDirectory={proj.resolve()}\n"
        "ExecStart=/usr/local/bin/uvicorn app:app --host 127.0.0.1 --port 8508\n", encoding="utf-8")
    (sysd / "unrelated.service").write_text("[Service]\nExecStart=/bin/other\n", encoding="utf-8")
    (ngx / "shop").write_text("server {\n  server_name shop.example.com;\n  proxy_pass http://127.0.0.1:8508;\n}\n", encoding="utf-8")
    out = gather_deploy_context(str(proj), str(root), systemd_dirs=[str(sysd)], nginx_dirs=[str(ngx)])
    assert "shop.service" in out and "8508" in out and "uvicorn" in out
    assert "proxy_pass" in out and "shop.example.com" in out
    assert "unrelated" not in out          # only project-related units


def test_gather_deploy_context_empty_when_nothing_matches(tmp_path):
    root = tmp_path / "srv"; root.mkdir()
    proj = root / "shop"; proj.mkdir()
    sysd = tmp_path / "systemd"; sysd.mkdir()
    (sysd / "other.service").write_text("ExecStart=/bin/x\n", encoding="utf-8")
    assert gather_deploy_context(str(proj), str(root), systemd_dirs=[str(sysd)], nginx_dirs=[]) == ""


def test_gather_deploy_context_confined_to_projects_root(tmp_path):
    root = tmp_path / "srv"; root.mkdir()
    outside = tmp_path / "outside"; outside.mkdir()
    assert gather_deploy_context(str(outside), str(root), systemd_dirs=[], nginx_dirs=[]) == ""


def test_gather_deploy_context_dedupes_symlinked_sites(tmp_path):
    """nginx sites-enabled is usually a symlink to sites-available → read once."""
    root = tmp_path / "srv"; root.mkdir()
    proj = root / "shop"; proj.mkdir()
    avail = tmp_path / "nginx-available"; avail.mkdir()
    enabled = tmp_path / "nginx-enabled"; enabled.mkdir()
    (avail / "shop").write_text("server_name shop.example.com;\nproxy_pass http://127.0.0.1:8508;\n", encoding="utf-8")
    (enabled / "shop").symlink_to(avail / "shop")
    out = gather_deploy_context(str(proj), str(root), systemd_dirs=[], nginx_dirs=[str(enabled), str(avail)])
    assert out.count("shop.example.com") == 1   # not duplicated
