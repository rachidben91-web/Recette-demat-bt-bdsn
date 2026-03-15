// js/ui/support-table.js
// Sous-module de rendu du tableau principal Support Journée

(function () {
    function createSupportTableModule(deps) {
        const {
            formatDateKey,
            getCurrentDate,
            getSupportTechStableId,
            getSupportRowData,
            findActivityByValue,
            normalizeActivity,
            defaultActivityColor,
            slugify,
            getActivities,
            activityDisplayLabel,
            sanitizeActivityColor,
            sanitizeAttendanceType,
            absenceCodes,
            isLight,
            sanitizeActivityText,
        } = deps;

        function createTableControlCell(control) {
            const cell = document.createElement('td');
            cell.appendChild(control);
            return cell;
        }

        function createActivitySelect({ techId, selectedLabel, backgroundColor, foregroundColor, borderColor }) {
            const select = document.createElement('select');
            select.className = 'editable-select input-act';
            select.dataset.tech = techId || '';
            select.style.backgroundColor = backgroundColor || '';
            select.style.color = foregroundColor || '';
            select.style.borderColor = borderColor || '#e2e8f0';

            const emptyOption = document.createElement('option');
            emptyOption.value = '';
            emptyOption.textContent = '-';
            select.appendChild(emptyOption);

            const knownLabels = new Set();
            getActivities().forEach((activity) => {
                const label = activityDisplayLabel(activity);
                if (!label || knownLabels.has(label)) return;
                knownLabels.add(label);
                const option = document.createElement('option');
                option.value = label;
                option.textContent = label;
                option.selected = selectedLabel === label;
                select.appendChild(option);
            });

            if (selectedLabel && !knownLabels.has(selectedLabel)) {
                const option = document.createElement('option');
                option.value = selectedLabel;
                option.textContent = selectedLabel;
                option.selected = true;
                select.appendChild(option);
            }

            return select;
        }

        function createBinarySelect(field, val, techId) {
            const select = document.createElement('select');
            select.className = 'editable-select';
            if (val === 'OUI') select.classList.add('val-oui');
            else if (val === 'NON') select.classList.add('val-non');
            select.dataset.tech = techId || '';
            select.dataset.field = field;

            const emptyOption = document.createElement('option');
            emptyOption.value = '';
            emptyOption.textContent = '-';
            select.appendChild(emptyOption);

            const yesOption = document.createElement('option');
            yesOption.value = 'OUI';
            yesOption.textContent = 'OUI';
            yesOption.selected = val === 'OUI';
            select.appendChild(yesOption);

            const noOption = document.createElement('option');
            noOption.value = 'NON';
            noOption.textContent = 'NON';
            noOption.selected = val === 'NON';
            select.appendChild(noOption);

            return select;
        }

        function createSingleYesSelect(field, val, techId) {
            const select = document.createElement('select');
            select.className = 'editable-select';
            select.dataset.tech = techId || '';
            select.dataset.field = field;
            select.style.fontSize = '10px';
            select.style.width = '50px';

            const emptyOption = document.createElement('option');
            emptyOption.value = '';
            emptyOption.textContent = '-';
            select.appendChild(emptyOption);

            const yesOption = document.createElement('option');
            yesOption.value = 'OUI';
            yesOption.textContent = 'OUI';
            yesOption.selected = val === 'OUI';
            select.appendChild(yesOption);

            return select;
        }

        function renderTable() {
            const tbody = document.getElementById('briefTableBody');
            if (!tbody) return;
            tbody.innerHTML = '';

            const key = formatDateKey(getCurrentDate());
            const savedDay = JSON.parse(localStorage.getItem('demat_day_' + key) || '{}');

            const techs = window.TECHNICIANS || [];
            if (!Array.isArray(techs) || techs.length === 0) {
                console.warn('[SUPPORT] renderTable: aucun technicien chargé (window.TECHNICIANS vide).');
            }

            let cptPres = 0;
            let cptAbs = 0;
            let cptGrv = 0;

            techs.forEach((tech, idx) => {
                const techId = getSupportTechStableId(tech);
                const rowData = getSupportRowData(savedDay, tech);

                const actName = String(rowData.act || '').trim();
                let actObj = findActivityByValue(actName);
                if (actName && !actObj) {
                    actObj = normalizeActivity({
                        label: actName,
                        color: defaultActivityColor,
                        attendanceType: 'present',
                        code: `tmp_${slugify(actName)}_${Date.now()}`
                    });
                    if (actObj) getActivities().push(actObj);
                }
                const actLabel = actObj ? activityDisplayLabel(actObj) : actName;

                const bgColor = sanitizeActivityColor(actObj?.color, defaultActivityColor);
                const fgColor = isLight(bgColor) ? '#000' : '#fff';
                const borderColor = bgColor || '#e2e8f0';

                const attendanceType = actObj?.attendanceType || sanitizeAttendanceType('', actName);
                if (attendanceType === 'absent') cptAbs++;
                else if (attendanceType === 'present') cptPres++;
                if (rowData.Grv === 'OUI') cptGrv++;

                const tr = document.createElement('tr');
                if (attendanceType === 'absent' || absenceCodes.has(actName)) {
                    tr.classList.add('row-absent');
                }

                let qualif = '';
                if (tech.ptc === true && tech.ptd === true) qualif = 'PTC-PTD';
                else if (tech.ptc === 'PTC - PTD') qualif = 'PTC-PTD';
                else if (tech.ptc) qualif = 'PTC';

                const indexCell = document.createElement('td');
                indexCell.style.textAlign = 'center';
                indexCell.style.color = '#94a3b8';
                indexCell.style.fontSize = '10px';
                indexCell.textContent = String(idx + 1);
                tr.appendChild(indexCell);

                const nameCell = document.createElement('td');
                nameCell.className = 'cell-name';
                nameCell.textContent = tech.name || '';
                tr.appendChild(nameCell);

                tr.dataset.techId = techId;
                tr.dataset.techName = tech.name || '';

                const qualifCell = document.createElement('td');
                qualifCell.className = 'cell-ptc';
                qualifCell.textContent = qualif;
                tr.appendChild(qualifCell);

                const activityCell = document.createElement('td');
                activityCell.appendChild(createActivitySelect({
                    techId,
                    selectedLabel: actLabel,
                    backgroundColor: bgColor,
                    foregroundColor: fgColor,
                    borderColor,
                }));
                tr.appendChild(activityCell);

                const obsCell = document.createElement('td');
                const obsInput = document.createElement('input');
                obsInput.className = 'editable-input input-obs';
                obsInput.dataset.tech = techId;
                obsInput.value = sanitizeActivityText(rowData.obs || '');
                obsInput.placeholder = '...';
                obsCell.appendChild(obsInput);
                tr.appendChild(obsCell);

                tr.appendChild(createTableControlCell(createBinarySelect('briefA', rowData.briefA, techId)));
                tr.appendChild(createTableControlCell(createBinarySelect('briefD', rowData.briefD, techId)));
                tr.appendChild(createTableControlCell(createBinarySelect('debriefA', rowData.debriefA, techId)));
                tr.appendChild(createTableControlCell(createBinarySelect('debriefD', rowData.debriefD, techId)));
                tr.appendChild(createTableControlCell(createSingleYesSelect('Grv', rowData.Grv, techId)));

                tbody.appendChild(tr);
            });

            console.log(`[SUPPORT] renderTable: ${techs.length} techniciens, ${tbody.querySelectorAll('tr').length} lignes rendues.`);

            const obsGlobal = document.getElementById('obsGlobal');
            if (obsGlobal) obsGlobal.value = savedDay.__GLOBAL_OBS || '';

            const elPres = document.getElementById('kpiPres');
            const elAbs = document.getElementById('kpiAbs');
            const elGrv = document.getElementById('kpiGreve');
            if (elPres) elPres.textContent = cptPres;
            if (elAbs) elAbs.textContent = cptAbs;
            if (elGrv) elGrv.textContent = cptGrv;
        }

        return {
            renderTable,
        };
    }

    window.createSupportTableModule = createSupportTableModule;
})();
