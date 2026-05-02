import sys, json, fitz

def fill_pdf(input_path, output_path, data):
    doc = fitz.open(input_path)
    field_counts = {}
    
    for page in doc:
        for field in page.widgets():
            name = field.field_name
            if name not in field_counts:
                field_counts[name] = 0
            else:
                field_counts[name] += 1
            idx = field_counts[name]
            key = name if idx == 0 else f"{name}#{idx}"
            
            # Solo usar la clave exacta, no el nombre generico si hay indice
            valor = data.get(key)
            
            if valor is None:
                continue
                
            if field.field_type_string == 'Text':
                field.field_value = str(valor)
                field.update()
            elif field.field_type_string == 'CheckBox' and valor:
                field.field_value = True
                field.update()
    
    doc.save(output_path)

if __name__ == '__main__':
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    json_path = sys.argv[3]
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    fill_pdf(input_path, output_path, data)
    print('OK')
