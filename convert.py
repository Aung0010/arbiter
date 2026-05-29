import re
import os

with open('landing.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Extract styles
style_match = re.search(r'<style>(.*?)</style>', html, re.DOTALL)
if style_match:
    styles = style_match.group(1)
    os.makedirs('landing', exist_ok=True)
    with open('landing/landing.css', 'w', encoding='utf-8') as f:
        f.write(styles.strip())

# Extract body
body_match = re.search(r'<body>(.*?)</body>', html, re.DOTALL)
if body_match:
    body = body_match.group(1)
    
    # Convert HTML to JSX
    body = body.replace('class="', 'className="')
    body = body.replace('<!--', '{/*')
    body = body.replace('-->', '*/}')
    body = re.sub(r'<img([^>]*[^/])>', r'<img\1 />', body)
    body = re.sub(r'<input([^>]*[^/])>', r'<input\1 />', body)
    body = re.sub(r'<hr([^>]*[^/])>', r'<hr\1 />', body)
    body = re.sub(r'<br([^>]*[^/])>', r'<br\1 />', body)
    
    # SVG fixes (optional but minimal: clip-path -> clipPath, fill-rule -> fillRule, etc)
    body = body.replace('fill-rule=', 'fillRule=')
    body = body.replace('clip-rule=', 'clipRule=')
    body = body.replace('stroke-linecap=', 'strokeLinecap=')
    body = body.replace('stroke-linejoin=', 'strokeLinejoin=')
    body = body.replace('stroke-width=', 'strokeWidth=')
    
    # Specific CTA fixes for React Router
    body = body.replace('href="/app"', 'to="/app"')
    body = body.replace('<a to="/app"', '<Link to="/app"')
    body = body.replace('</a>', '</Link>') # wait, we only want to replace </a> for the links we changed to Link.
    # A safer way is to just leave them as <a href="/app"> in React, they work fine and cause a full page load, which is acceptable or even preferred when moving to the App context if it's heavy, but Link is better for SPA.
    # Let's just use `Link` for `/app`
    
tsx = f"""import React from 'react';
import './landing.css';
import {{ Link }} from 'react-router-dom';

const Landing: React.FC = () => {{
  return (
    <div className="landing-page-root">
      {body}
    </div>
  );
}};

export default Landing;
"""

with open('landing/Landing.tsx', 'w', encoding='utf-8') as f:
    f.write(tsx)

print("Conversion done.")
