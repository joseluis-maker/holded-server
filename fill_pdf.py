import sys, json, fitz

def fill_pdf(input_path, output_path, data):
    doc = fitz.open(input_path)
    for page in doc:
        for field in page.widgets():
            name = field.field_name
            if name in data and field.field_type_string == 'Text':
                field.field_value = data[name]
                field.update()
            elif name in data and field.field_type_string == 'CheckBox':
                if data[name]:
                    field.field_value = True
                    field.update()
    doc.save(output_path)

if __name__ == '__main__':
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    data = json.loads(sys.argv[3])
    fill_pdf(input_path, output_path, data)
    print('OK')
