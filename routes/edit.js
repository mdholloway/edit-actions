'use strict';

const _ = require('lodash');
const preq = require('preq');
const api = require('../lib/api-util');
const sUtil = require('../lib/util');
const router = sUtil.router();

let app;

// eslint-disable-next-line max-len
const wikilangs = ['en','es','de','ja','fr','ru','pt','it','zh-hans','zh-hant','ar','id','pl','nl','ko','fa','hi','th','vi','sv','cs','simple','hu','uk','fi','ro','he','el','nb','da','hr','sr','ms','bg','tl','ca','sk','tr','bn','sh','ta','mr','lt','bs','sl','az','zh-yue','arz','ka','et','ml','te','sq','hy','lv','kk','kn','af','gl','mk','ur','nn','sw','gu','uz','eu','ast','is','km','eo','be-x-old','sco','bh','si','mn','ig','pa','azb','ky','ne','be','ceb','my','la','jv','an','als','so','su','bar','cy','as','mzn','tt','scn','pnb','or','am','war','lb','ckb','fy','yi','map-bms','br','zh-classical','gn','vec','zh-min-nan','tg','ba','lmo','sa','ps','oc','nds','new','ga','wuu','ce','ku','nap','hif','cv','mg','bpy','ia','bcl','xmf','tk','mai','gan','sah','fo','pam','io','min','os','eml','rue','sd','ht','lo','li','ang','ilo','bo','szl','sn','qu','vls','yo','wa','nds-nl','sc','frr','ace','hsb','mhr','ha','vo','gd','mt','ksh','rw','pms','bjn','pfl','nah','diq','glk','bat-smg','hak','cdo','mrj','se','om','kv','dv','co','crh','lij','csb','gv','lad','pdc','bxr','myv','udm','ln','nso','lez','vep','pcd','zu','pih','dsb','fur','frp','pag','stq','xh','nrm','fiu-vro','ext','krc','mwl','tpi','mi','av','ay','rm','gom','kw','ug','arc','pap','jbo','roa-tara','xal','tet','tcy','zea','chr','nov','dty','gag','nv','jam','tn','lfn','st','kaa','ie','cbk-zam','tyv','kab','roa-rup','pi','kl','cu','lrc','ts','pnt','koi','za','bug','lg','kbd','ak','haw','sm','na','wo','kg','lbe','iu','ss','ch','olo','bm','mdf','bi','rmy','kbp','to','chy','dz','tw','fj','inh','ee','ks','srn','ve','ti','ny','ltg','ki','ik','tum','ty','rn','ady','ff','gor','sg','cr','atj','din','sat','test','en-x-piglatin','ab'];

const pageQuery = {
    action: 'query',
    formatversion: 2,
    generator: 'random',
    redirects: 1,
    grnnamespace: 0,
    grnlimit: 50,
    prop: 'pageprops|description'
};

const wikidataQuery = {
    action: 'wbgetentities',
    props: 'descriptions|labels|sitelinks'
};

function isValidLang(lang) {
    return wikilangs.includes(lang);
}

function getPages(app, domain, cond) {
    return api.mwApiGet(app, domain, pageQuery)
    .then((rsp) => {
        const pages = rsp.body.query.pages.filter(cond);
        return pages[0] ? pages : getPages(app, domain, cond);
    });
}

function getWikidataInfo(ids) {
    return api.mwApiGet(app, 'www.wikidata.org', Object.assign(wikidataQuery, { ids }));
}

function getPage(app, domain, cond) {
    return getPages(app, domain, cond).then(pages => pages[0]);
}

function getPageSummary(domain, title) {
    return preq.get(`https://${domain}/api/rest_v1/page/summary/${title}`);
}

function getEntityForTranslation(app, domain, cond, srcLang, dstLang) {
    return getPages(app, domain, cond)
    .then(rsp => getWikidataInfo(rsp.map(p => p.pageprops.wikibase_item).join('|')))
    .then((rsp) => {
        const cond2 = e => e.labels[srcLang] && e.descriptions[srcLang] && !e.descriptions[dstLang]
            && e.sitelinks[`${srcLang}wiki`] && e.sitelinks[`${dstLang}wiki`];
        const e = _.values(rsp.body.entities).filter(cond2)[0];
        return e || getEntityForTranslation(app, domain, cond, srcLang, dstLang);
    });
}

router.get('/needs/description', (req, res) => {
    const domain = req.params.domain;
    if (!domain.endsWith('wikipedia.org')) {
        throw new sUtil.HttpError('invalid domain');
    }
    const cond = p => !p.description && p.pageprops && !p.pageprops.disambiguation;
    return getPage(app, domain, cond)
    .then(p => getPageSummary(domain, encodeURIComponent(p.title.replace(/ /g, '_'))))
    .then(s => res.status(200).json(s.body));
});

router.get('/needs/description/in/:lang', (req, res) => {
    const domain = req.params.domain;
    if (!domain.endsWith('wikipedia.org')) {
        throw new sUtil.HttpError('invalid domain');
    }
    const srcLang = domain.split('.')[0];
    const dstLang = req.params.lang;
    if (srcLang === dstLang || !isValidLang(dstLang)) {
        throw new sUtil.HttpError('invalid lang');
    }
    const cond = p => p.pageprops && !p.pageprops.disambiguation && p.pageprops.wikibase_item;
    return getEntityForTranslation(app, req.params.domain, cond, srcLang, dstLang)
    .then(e => getPageSummary(domain, encodeURIComponent(e.sitelinks[`${srcLang}wiki`].title)))
    .then(s => res.status(200).json(s.body));
});

module.exports = (appObj) => {

    app = appObj;

    return {
        path: '/',
        api_version: 1,
        router
    };

};
