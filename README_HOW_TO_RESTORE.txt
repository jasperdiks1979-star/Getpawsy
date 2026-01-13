GetPawsy split ZIP parts (<25MB each)

How to restore:
1) Put all GetPawsy_part*.zip in the same folder.
2) Create an empty folder, e.g. GetPawsy/
3) Unzip EACH part into that same folder (merge/replace when asked).
   - mac/linux: for f in GetPawsy_part*.zip; do unzip -o "$f" -d GetPawsy; done
   - Windows PowerShell: Get-ChildItem GetPawsy_part*.zip | % { Expand-Archive $_.FullName -DestinationPath GetPawsy -Force }
4) Excluded file(s) too large for GitHub web upload (>25MB):
   - public/qa/proof/prod-small-pets-FINAL.png (27.5 MB)

If you need that excluded file, compress/resize it or store it outside GitHub.
