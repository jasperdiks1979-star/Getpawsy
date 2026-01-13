"""
GetPawsy ULTRA Legal AI Engine V1
AI-powered legal page management for US-compliant e-commerce
"""

import os
import json
from datetime import datetime

def get_openai_client():
    try:
        from openai import OpenAI
        return OpenAI()
    except:
        return None

def read_legal_page(page_name):
    slug_map = {'ai': 'ai_disclosure', 'eu-gdpr': 'eu_gdpr', 'california-ai': 'california_age_ai', 'accessibility': 'ada_accessibility', 'pet-safety': 'pet_safety'}
    page_name = slug_map.get(page_name, page_name)
    
    page_map = {
        'terms': 'terms.ejs',
        'privacy': 'privacy.ejs',
        'returns': 'returns.ejs',
        'shipping': 'shipping.ejs',
        'refund': 'refund.ejs',
        'about': 'about.ejs',
        'cookies': 'cookies.ejs',
        'ai_disclosure': 'ai_disclosure.ejs',
        'eu_gdpr': 'eu_gdpr.ejs',
        'california_age_ai': 'california_age_ai.ejs',
        'ada_accessibility': 'ada_accessibility.ejs',
        'pet_safety': 'pet_safety.ejs'
    }
    
    filename = page_map.get(page_name, f'{page_name}.ejs')
    filepath = os.path.join(os.path.dirname(__file__), '..', 'views', 'legal', filename)
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return {'success': True, 'content': f.read(), 'path': filepath}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def save_legal_page(page_name, content):
    slug_map = {'ai': 'ai_disclosure', 'eu-gdpr': 'eu_gdpr', 'california-ai': 'california_age_ai', 'accessibility': 'ada_accessibility', 'pet-safety': 'pet_safety'}
    page_name = slug_map.get(page_name, page_name)
    
    page_map = {
        'terms': 'terms.ejs',
        'privacy': 'privacy.ejs',
        'returns': 'returns.ejs',
        'shipping': 'shipping.ejs',
        'refund': 'refund.ejs',
        'about': 'about.ejs',
        'cookies': 'cookies.ejs',
        'ai_disclosure': 'ai_disclosure.ejs',
        'eu_gdpr': 'eu_gdpr.ejs',
        'california_age_ai': 'california_age_ai.ejs',
        'ada_accessibility': 'ada_accessibility.ejs',
        'pet_safety': 'pet_safety.ejs'
    }
    
    filename = page_map.get(page_name, f'{page_name}.ejs')
    filepath = os.path.join(os.path.dirname(__file__), '..', 'views', 'legal', filename)
    
    backup_dir = os.path.join(os.path.dirname(__file__), '..', 'data', 'legal_backups')
    os.makedirs(backup_dir, exist_ok=True)
    
    try:
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                old_content = f.read()
            backup_path = os.path.join(backup_dir, f'{page_name}_{datetime.now().strftime("%Y%m%d_%H%M%S")}.ejs')
            with open(backup_path, 'w', encoding='utf-8') as f:
                f.write(old_content)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        
        return {'success': True, 'message': 'Page saved successfully'}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def ai_rewrite_page(page_name, current_content, action='rewrite'):
    slug_map = {'ai': 'ai_disclosure', 'eu-gdpr': 'eu_gdpr', 'california-ai': 'california_age_ai', 'accessibility': 'ada_accessibility', 'pet-safety': 'pet_safety'}
    page_name = slug_map.get(page_name, page_name)
    
    client = get_openai_client()
    
    if not client:
        return {'success': False, 'error': 'OpenAI client not available'}
    
    page_descriptions = {
        'terms': 'Terms and Conditions for an e-commerce pet products store',
        'privacy': 'Privacy Policy covering CCPA and GDPR compliance',
        'returns': 'Return Policy for pet products (30-day returns)',
        'shipping': 'Shipping Policy for US-only delivery',
        'refund': 'Refund Policy with processing times and conditions',
        'about': 'About Us page for a pet products company called GetPawsy',
        'cookies': 'Cookie Policy for website tracking and personalization',
        'ai_disclosure': 'AI Transparency Notice explaining AI usage in the store',
        'eu_gdpr': 'GDPR Addendum for EU customers with data protection rights',
        'california_age_ai': 'California CPRA and Age-Appropriate Design Code compliance',
        'ada_accessibility': 'ADA Accessibility Statement with WCAG 2.1 AA commitment',
        'pet_safety': 'Pet Product Safety Disclaimer with choking hazards and supervision notices'
    }
    
    action_prompts = {
        'rewrite': f"""Completely rewrite this {page_descriptions.get(page_name, 'legal page')} for GetPawsy, a US-based e-commerce pet products store.
        
Requirements:
- Use Delaware as governing law state
- Be compliant with current US e-commerce regulations
- Keep the EJS template structure (<%- include() %> tags)
- Maintain professional but friendly tone
- Include all necessary legal protections for the business
- Reference GetPawsy's AI-powered features where relevant
- Keep similar HTML structure and CSS classes

Current content:
{current_content}""",

        'update': f"""Update this {page_descriptions.get(page_name, 'legal page')} to match the latest US regulations (2024-2025).

Requirements:
- Keep the existing structure and style
- Update any outdated legal language
- Ensure CCPA compliance if applicable
- Add any missing required disclosures
- Preserve the EJS template structure

Current content:
{current_content}""",

        'simplify': f"""Simplify this {page_descriptions.get(page_name, 'legal page')} to be more readable and user-friendly.

Requirements:
- Use plain English instead of legal jargon
- Break up long paragraphs
- Add clear headings if missing
- Keep all essential legal protections
- Preserve the EJS template structure and HTML

Current content:
{current_content}""",

        'summarize': f"""Add a brief summary section at the top of this {page_descriptions.get(page_name, 'legal page')}.

Requirements:
- Add a "Key Points" or "Summary" section after the header
- Use bullet points for easy scanning
- Keep the full legal text below
- Preserve the EJS template structure

Current content:
{current_content}"""
    }
    
    prompt = action_prompts.get(action, action_prompts['rewrite'])
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": """You are a legal content specialist for US e-commerce businesses. 
You create professional, compliant legal pages that protect businesses while being readable.
Always preserve EJS template syntax like <%- include('partials/header') %>.
Output only the complete page content, no explanations."""
                },
                {"role": "user", "content": prompt}
            ],
            max_tokens=4000,
            temperature=0.3
        )
        
        new_content = response.choices[0].message.content
        
        log_ai_action(page_name, action, len(current_content), len(new_content))
        
        return {'success': True, 'content': new_content}
        
    except Exception as e:
        return {'success': False, 'error': str(e)}

def log_ai_action(page_name, action, old_length, new_length):
    log_file = os.path.join(os.path.dirname(__file__), '..', 'data', 'legal_ai_logs.json')
    
    try:
        if os.path.exists(log_file):
            with open(log_file, 'r') as f:
                logs = json.load(f)
        else:
            logs = {'actions': []}
        
        logs['actions'].append({
            'page': page_name,
            'action': action,
            'timestamp': datetime.now().isoformat(),
            'old_length': old_length,
            'new_length': new_length
        })
        
        logs['actions'] = logs['actions'][-100:]
        
        with open(log_file, 'w') as f:
            json.dump(logs, f, indent=2)
    except:
        pass

def get_ai_logs():
    log_file = os.path.join(os.path.dirname(__file__), '..', 'data', 'legal_ai_logs.json')
    
    try:
        if os.path.exists(log_file):
            with open(log_file, 'r') as f:
                return json.load(f)
        return {'actions': []}
    except:
        return {'actions': []}
