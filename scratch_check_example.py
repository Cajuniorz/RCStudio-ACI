with open('static/app.js', 'r', encoding='utf-8') as f:
    for idx, line in enumerate(f):
        if "'example'" in line or '"example"' in line:
            print(idx + 1, line[:80].encode('ascii', 'ignore').decode('ascii'))
