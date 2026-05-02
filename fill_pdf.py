import sys, json, fitz

def fill_pdf(input_path, output_path, data):
    doc = fitz.open(input_path)
    field_counts = {}
    page_field_counts = {}
    
    for page in doc:
        page_num = page.number
        page_field_counts[page_num] = {}
        
        for field in page.widgets():
            name = field.field_name
            if name not in field_counts:
                field_counts[name] = 0
            else:
                field_counts[name] += 1
            global_idx = field_counts[name]
            global_key = name if global_idx == 0 else f"{name}#{global_idx}"
            
            if name not in page_field_counts[page_num]:
                page_field_counts[page_num][name] = 0
            else:
                page_field_counts[page_num][name] += 1
            page_idx = page_field_counts[page_num][name]
            page_key_base = name if page_idx == 0 else f"{name}#{page_idx}"
            page_key = f"p{page_num}_{page_key_base}"
            
            valor = data.get(page_key, data.get(global_key))
            
            if valor is None:
                continue
            
            if field.field_type_string == 'Text':
                field.field_value = str(valor)
                field.update()
            elif field.field_type_string == 'CheckBox' and valor:
                field.field_value = True
                field.update()
    
    doc.save(output_path, deflate=True, garbage=4)

if __name__ == '__main__':
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    json_path = sys.argv[3]
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    fill_pdf(input_path, output_path, data)
    print('OK')
