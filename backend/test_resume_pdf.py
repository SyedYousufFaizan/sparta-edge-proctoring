import unittest
import pymupdf
from resume_pdf import replace_resume_bullets, normalized


class ResumePdfTests(unittest.TestCase):
    def setUp(self):
        with pymupdf.open() as document:
            page = document.new_page()
            page.insert_text((72, 72), 'Built Python APIs with MySQL.', fontsize=11)
            page.insert_text((72, 105), 'Unselected bullet stays unchanged.', fontsize=11)
            page = document.new_page()
            page.insert_text((72, 72), 'Untouched second page.', fontsize=11)
            self.original = document.tobytes()
        self.pair = {'original': 'Built Python APIs with MySQL.', 'enhanced': 'Developed Python APIs with MySQL.'}

    def test_replaces_target_without_adding_pages(self):
        output = replace_resume_bullets(self.original, [self.pair])
        with pymupdf.open(stream=self.original, filetype='pdf') as original, pymupdf.open(stream=output, filetype='pdf') as copy:
            self.assertEqual(len(copy), len(original))
            text = copy[0].get_text()
            self.assertIn(normalized(self.pair['enhanced']), normalized(text))
            self.assertNotIn(self.pair['original'], text)
            self.assertIn('Unselected bullet stays unchanged.', text)
            self.assertEqual(original[1].get_pixmap().samples, copy[1].get_pixmap().samples)

    def test_rejects_missing_duplicate_and_overlapping_matches(self):
        for pairs in ([{'original':'Not present', 'enhanced':'New text'}], [self.pair,self.pair]):
            with self.assertRaises(ValueError):
                replace_resume_bullets(self.original,pairs)
        with pymupdf.open(stream=self.original,filetype='pdf') as doc:
            doc[0].insert_text((72,150),self.pair['original'])
            with self.assertRaisesRegex(ValueError,'more than one location'):
                replace_resume_bullets(doc.tobytes(),[self.pair])

    def test_long_replacement_fails_instead_of_overwriting_neighbors(self):
        pair={**self.pair,'enhanced':'Very long replacement text. '*100}
        with self.assertRaisesRegex(ValueError,'too long'):
            replace_resume_bullets(self.original,[pair])

    def test_normalizes_line_breaks_ligatures_and_hyphenation(self):
        self.assertEqual(normalized('per-\nceived ﬁle'),normalized('perceived file'))
        with pymupdf.open() as doc:
            page=doc.new_page()
            page.insert_text((72,72),'Implemented per-')
            page.insert_text((72,86),'ceived improvements.')
            output=replace_resume_bullets(doc.tobytes(),[{'original':'Implemented perceived improvements.','enhanced':'Improved perceived quality.'}])
        with pymupdf.open(stream=output,filetype='pdf') as copy:
            self.assertIn(normalized('Improved perceived quality.'),normalized(copy[0].get_text()))
            self.assertNotIn('per-',copy[0].get_text())

    def test_rejects_invalid_input_and_placeholders(self):
        for pairs in ([], ['string'], [{'original':'X','enhanced':' '}], [{**self.pair,'enhanced':'🔴[add verified metric]'}]):
            with self.assertRaises(ValueError):
                replace_resume_bullets(self.original,pairs)
        with self.assertRaises(ValueError):
            replace_resume_bullets(b'not a PDF',[self.pair])


if __name__ == '__main__':
    unittest.main()
