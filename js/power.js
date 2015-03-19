// this is a demo for my old friends at energy intellect, they were good times :)
// this on purpose contains a LOT of processing, so you can scavange it for code later. 
// because of this, we are doing more complex stuff then we would normally do.
// I think you will be happy with the results however

// --- Blair Nilsson (blair.nilsson@gmail.com)

// These are the fields we will be using
// date
// site_name
// energy_used
// reactive_energy_used
// demand
// alarms

// sadly there is a bug in dc to do with composite charts. here is the fix.
(function () {
    var compositeChart = dc.compositeChart;
    dc.compositeChart = function(parent, chartGroup) {
        var _chart = compositeChart(parent, chartGroup);
        
        _chart._brushing = function () {
            var extent = _chart.extendBrush();
            var rangedFilter = null;
            if(!_chart.brushIsEmpty(extent)) {
                rangedFilter = dc.filters.RangedFilter(extent[0], extent[1]);
            }

            dc.events.trigger(function () {
                if (!rangedFilter) {
                    _chart.filter(null);
                } else {
                    _chart.replaceFilter(rangedFilter);
                }
                _chart.redrawGroup();
            }, dc.constants.EVENT_DELAY);
        };
        
        return _chart;
    };
})();



// times in the data file are in the form of - Sun 22 Feb 2015 00:30
time_format = d3.time.format('%a %d %b %Y %H:%M')
//time_format = d3.time.format('%d/%m/%Y %H:%M')

function process(d) {
  d.date = time_format.parse(d.date);
  d.hour_of_day = d.date.getHours();
  d.day_of_week = d.date.getDay();
  d.energy_used = +d.energy_used
  d.reactive_energy_used = +d.reactive_energy_used
  d.energy_used_bin = Math.floor(d.energy_used)
  d.demand = +d.demand
  d.demand_bin = Math.floor(d.demand)
  d.power_factor = d.energy_used / d.demand
}

var data

// the main event, load the data, build the charts!!!
queue()
  .defer(d3.tsv, '../data/power.tsv') // load and parse power.tsv
//.defer(d3.tsv, '../data/big.tsv') // load and parse power.tsv
  .await(showCharts) // then show the chart

function showCharts(error, results) {
    
  colorPallete = colorbrewer.Set3[9];     
  colorDomain = [0, 8];
  data = results; // move scope, so we can debug in console.
  
  _.forEach(data, process); // clean up the data - parse dates for instance
  
  //console.log(data)
  
  ndx = crossfilter(data);
  energy_total = ndx.groupAll().reduceSum(function(d) {return d.energy_used;}); 
  overall_max_demand = reductio().max(function (d) { return +d.demand; })(ndx.groupAll()).value();
  
  
  reducer = reductio()
  overall_max_dimension = ndx.dimension(_.property('site_name'));
  
  
  date = ndx.dimension(_.property('date'));  
  date_energy_group = date.group().reduceSum(_.property('energy_used'));
  date_demand_group = date.group().reduceSum(_.property('demand'));
  
  site_name = ndx.dimension(_.property('site_name'));

    
  site_group = site_name.group().reduceSum(_.property('energy_used'));
  site_demand = ndx.dimension(_.property('site_name'));  // Has to be on its own dimension for filter to work
  site_demand_group = reductio().max(function (d) { return +d.demand; }).sum(function (d) { return +d.energy_used; })(site_demand.group());
  
  site_date = ndx.dimension(function(d) { return [new Date(d.date).getTime(), d.site_name, d.alarms];})  // Must construct new Date, as it relies on natual odering
  site_date_energy_group = site_date.group().reduceSum(_.property('energy_used'));
  
  
  energy_used = ndx.dimension(_.property('energy_used_bin'));
  energy_used_group = energy_used.group().reduceCount();
  
  demand = ndx.dimension(_.property('demand_bin'));
  demand_group = demand.group().reduceCount();

  hour_of_day = ndx.dimension(_.property('hour_of_day'));
  day_of_week = ndx.dimension(_.property('day_of_week'));
  energy_hour_of_day_group = reductio().sum(function (d) { return +d.energy_used; })(hour_of_day.group()) 
  energy_day_of_week_group = reductio().sum(function (d) { return +d.energy_used; })(day_of_week.group()) 
  demand_hour_of_day_group = reductio().max(function (d) { return +d.demand; })(hour_of_day.group()) 
  demand_day_of_week_group = reductio().max(function (d) { return +d.demand; })(day_of_week.group())  
    
  reducer = reductio()
  power_factor_dimension = ndx.dimension(_.property('site_name'));
  reducer.value('demand').max(function (d) { return +d.demand; });
  reducer.value('energy_used').sum(function (d) { return +d.energy_used; });
  reducer.value('reactive_energy_used').sum(function (d) { return +d.reactive_energy_used; });
  reducer.value('alarms').exception(function(d) {
      return d.alarms ? d.alarms + d.date : null; }).exceptionCount(true)    // TODO: Fix is properly
  power_factor_group = power_factor_dimension.group()
  reducer(power_factor_group)
    
  alarms = ndx.dimension(_.property('alarms'));
  alarms_group = alarms.group().reduceCount();
  
  date_domain = [
     d3.time.hour.offset(date.bottom(1)[0].date, -1),
     d3.time.hour.offset(date.top(1)[0].date, +1)
  ]

  //////////////////////////////// Drill Down Chart //////////////////////////////////
  date_chart = dc.compositeChart('#date_chart')
    .height(300)
    .width(950)
    .dimension(date)  // required for date filter to work
    .elasticY(true)
    .x(d3.time.scale().domain(date_domain))
    .transitionDuration(300)
    .yAxisLabel('Wh')
    .xAxisLabel('Date / Time')
    //.legend(dc.legend().x(970).y(10).itemHeight(13).gap(5))
    
  
  date_chart.yAxis().tickFormat(d3.format('s'));
  
    
  date_energy_chart = dc.lineChart(date_chart)
    .group(date_energy_group, 'energy')
    .colors('green');
    
  var siteSeries = site_name.group().all().map(function(d,fi) {
    var _siteName = d.key;
    var group_per_site = 
        dc.lineChart(date_chart)
        .group({all:function() {
                                return site_date_energy_group.all().filter(function(d) {
                                return d.key[1] === _siteName;});
                                }}
               , _siteName)
        .colors(colorPallete)
        .colorDomain(colorDomain)
        .colorAccessor(function(){return fi;})        
        .keyAccessor(function(d) {return d.key[0];});

      return group_per_site;
  });
    
  var symbolScale = d3.scale.ordinal().range(d3.svg.symbolTypes);
  var symbolAccessor = function(d) { return symbolScale(d.key[0]); };  
  var alarmSeries = site_name.group().all().map(function(d,fi) {
    var _siteName = d.key;
    var group_per_site = 
        dc.scatterPlot(date_chart)
        .group({all:function() {
                                return site_date_energy_group.all().filter(function(d) {
                                return d.key[1] === _siteName && d.key[2];});
                                }}
               , _siteName + ' alarms')
        .symbol(symbolAccessor)
        .symbolSize(8)
        .colors(colorbrewer.Dark2[8])  // must use other colors, 
        .colorDomain([0, 6])
        .colorAccessor(function(){return fi;})        
        .keyAccessor(function(d) {return d.key[0];})
        .valueAccessor(function(d) {return d.value;});
      return group_per_site;
  });
    
    
    date_chart.compose(siteSeries.concat(alarmSeries));
    
  //////////////////////////// Peak Demand Chart /////////////////////////////
  site_demand_chart = dc.rowChart('#site_demand_chart')
      .height(300)
      .width(280)
      .dimension(site_name)
      .group(site_group)
      .transitionDuration(300)
      .colors(colorPallete) // (optional) define color function or array for bubbles
      .colorDomain(colorDomain)
      .colorAccessor(function(d, fi) {return fi})
      //.valueAccessor(function(d) {return d.value.max})
      .valueAccessor(function(d) {return 1})
      
  //site_demand_chart.xAxis().tickFormat(d3.format('s'));
  site_demand_chart.xAxis().tickFormat(function(v) { return ""; });
  site_demand_chart.xAxis().tickValues([]);

    
    
  //////////////// Pie Chart //////////////////////////////
    pie_chart = dc.pieChart("#site_pie_chart")
        .height(300).width(600)
        .dimension(site_demand)
        .group(site_demand_group)
        .colors(colorPallete)
        .colorDomain(colorDomain)
        .colorAccessor(function(d, fi) {return fi})
        .valueAccessor(function (d) {return d.value.sum;})
        .label(function (d) {
            if (pie_chart.hasFilter() && !pie_chart.hasFilter(d.key)) {
                return d.key + '(0%)';
            }
            var label = d.key;
            if (energy_total) {
                label = Math.round(d.value.sum / energy_total.value() * 100) + '%';
            }
            return label;
        })
        .transitionDuration(300)
        .title(function (d) {
            var label = d.key;
            if (d.value.sum) {               
                label += '\nEnergy: ' + d.value.sum.toFixed(2) + ' Wh\n';
            }
            return label;
        });
    
  /////////////////// Energy frequency Chart //////////////////////
  energy_used_domain = [
    0,
    energy_used.top(1)[0].energy_used_bin + 1
  ]
  
  energy_used_chart = dc.barChart('#energy_used_chart')
    .height(300)
    .width(500)
    .dimension(energy_used)
    .group(energy_used_group)
    .transitionDuration(300)
    .elasticY(true)
    .x(d3.scale.linear().domain(energy_used_domain))
    .xAxisLabel("Wh")    
    .yAxisLabel("# Occurance") 

  energy_used_chart.xAxis().tickFormat(d3.format('s'));

  
  /////////////////// Demand Frequency Chart //////////////////////
  demand_domain = [
    0,
    demand.top(1)[0].demand_bin + 1
  ]
  
  demand_chart = dc.barChart('#demand_chart')
    .height(300)
    .width(500)
    .dimension(demand)
    .group(demand_group)
    .transitionDuration(300)
    .elasticY(true)
    .x(d3.scale.linear().domain(demand_domain))
    .xAxisLabel("VA")    
    .yAxisLabel("# Occurance") 
  
  demand_chart.xAxis().tickFormat(d3.format('s'));
  
  /////////////////// Energy Frequency Chart //////////////////////
  energy_hour_chart = dc.barChart('#energy_hour_chart')
    .height(300)
    .width(500)
    .dimension(hour_of_day)
    .group(energy_hour_of_day_group)
    .valueAccessor(function(d) {return d.value.energy_used})
    .transitionDuration(300)
    .elasticY(true)
    .x(d3.scale.linear().domain([0,24]))
    .colors('green')

  energy_hour_chart.yAxis().tickFormat(d3.format('s'));
    
  /////////////////// 7 Days Chart ////////////////////    
  energy_daily_chart = dc.compositeChart('#energy_daily_chart')
    .height(300)
    .width(500)
    .dimension(day_of_week)
    .transitionDuration(300)
    .elasticY(true)
    .x(d3.scale.linear().domain([0,7]))
    .renderHorizontalGridLines(true)
    .xAxisLabel("Day of Week")    
    .yAxisLabel("Wh") 
    .rightYAxisLabel("VA")

    energy_daily_bar_plot = dc.barChart(energy_daily_chart)
    .valueAccessor(function(d) {return d.value.sum})
    .group(energy_day_of_week_group)
    .colors('green')

    
    demand_daily_line_plot = dc.lineChart(energy_daily_chart)
    .valueAccessor(function(d) {return d.value.max})
    .group(demand_day_of_week_group)
    .colors('#6E257A')
    .useRightYAxis(true)
    
  energy_daily_chart.compose([energy_daily_bar_plot, demand_daily_line_plot]);  
  energy_daily_chart.yAxis().tickFormat(d3.format('s'));
    
  ///////////////////////// 24 hour Chart /////////////////////////////
  energy_hourly_chart = dc.compositeChart('#energy_hourly_chart')
    .height(300)
    .width(500)
    .dimension(hour_of_day)
    .transitionDuration(300)
    .elasticY(true)
    .x(d3.scale.linear().domain([0,24]))  
    .xAxisLabel("Hour of Day")    
    .yAxisLabel("Wh") 
    .rightYAxisLabel("VA")

    energy_hourly_bar_plot = dc.barChart(energy_hourly_chart)
    .valueAccessor(function(d) {return d.value.sum})
    .group(energy_hour_of_day_group)
    .colors('green')
    
    demand_hourly_line_plot = dc.lineChart(energy_hourly_chart)
    .valueAccessor(function(d) {return d.value.max})
    .group(demand_hour_of_day_group)
    .colors('#6E257A')
    .useRightYAxis(true)
    
  energy_hourly_chart.compose([energy_hourly_bar_plot, demand_hourly_line_plot]);    
  energy_hourly_chart.yAxis().tickFormat(d3.format('s'));
  

    
  /////////////// Summary Table //////////////////////////////

    var tableDimension = site_name;
    var dimension_top_override = function(x){
      return power_factor_group.top(x)
            .map(function (d) { return {"site_name":d.key, "energy_used":d.value.energy_used.sum, "demand":d.value.demand.max, "alarms":d.value.alarms.exceptionCount}; });
    }
    
    tableDimension.bottom = dimension_top_override
    tableDimension.top = dimension_top_override
    
//    overall_max_energy = tableDimension.group()
//    reducer.value('energy_used').max(function (d) {return +d.energy_used; });
//    reducer(overall_max_energy)
//  
 
    dc.dataTable('#summary_table_table')
        .dimension(tableDimension)
        .group(function(d) { return ''})
        .columns([
            function(d) { 
                if (d.demand)
                  return d.site_name; 
                else return '&nbsp';},
            function(d) { 
                if (d.energy_used.toFixed(2) > 0)
                  return d.energy_used.toFixed(2);
                //return '<div style="width:' + d.energy_used/overall_max_energy.max + '%; background-color: #5cb85c">' + d.energy_used.toFixed(2) + '</div>'; 
            },
            function(d) { 
                if (d.demand)
                  return '<div style="width:' + d.demand * 100/overall_max_demand.max + '%; background-color: #DB72ED">' + d.demand + '</div>'; 
//                if (d.demand >= overall_max_demand.max)
//                    return '<span style="color: red">' + d.demand + '</span>';
//                else
//                    return d.demand; 
            },
            function(d) { 
                if (d.demand)
                  return d.alarms > 1 ? 'Yes' : 'No'; }  // TODO: Fix is properly
        ]).width(800)
        .sortBy(function (d) {
            return d.site_name;
        })
        .renderlet(function (table) {
        $('.dc-table-row td:first-child').each(function(i) {
          if ($.trim($(this).text()).length > 0) {
            $(this).css('background-color', colorPallete[i]);
          }
        })

        });;
    
  ///////////////// Bubble Chart ///////////////////////////////
  power_factor_chart = dc.bubbleChart('#power_factor_chart')
        .width(600) // (optional) define chart width, :default = 200
        .height(320)  // (optional) define chart height, :default = 200
        .dimension(power_factor_dimension)
        .group(power_factor_group)
        .colors(d3.scale.category20c()) // (optional) define color function or array for bubbles
        .colorAccessor(function (p, fi) {return fi;})
        .keyAccessor(function (p) {
           return p.value.energy_used.sum;
        })
        .valueAccessor(function (p) {
            return p.value.demand.max;
        })
        .radiusValueAccessor(function (p) {      
            return p.value.demand.max * 1000 / p.value.energy_used.sum;
            //return Math.hypot(p.value.energy_used.sum, p.value.reactive_energy_used.sum) / p.value.energy_used.sum;
        })
        .x(d3.scale.linear().domain([0, 35000]))  // TODO: make it dynamic
        .y(d3.scale.linear().domain([0, overall_max_demand.max * 1.1]))
        .xAxisLabel('Wh')
        .yAxisLabel('VA')
        .title(function (d) {
            var label = d.key;
            if (d.value.energy_used && d.value.deman) {               
                label += '\nEnergy: ' + d.value.energy_used.sum.toFixed(2) + ' Wh\n'
                label += 'Peak Demand: ' + d.value.demand.max.toFixed(2) + ' VA\n'
                //label += 'PF: ' + (d.value.energy_used.sum / Math.hypot(d.value.energy_used.sum, d.value.reactive_energy_used.sum)).toFixed(2) + '\n';
            }
            return label;
        })
 
  dc.renderAll();    
}